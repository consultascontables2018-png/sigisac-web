// SIGISAC ERP · base compartida del sitio en Netlify (Netlify Functions + Netlify Blobs).
// Guarda cada colección (usuarios, alertas, mensajes, ingresos, entreg, campo, planes…) como un documento JSON con
// número de versión; el navegador consulta cada pocos segundos y solo descarga cuando hubo cambios.
// Seguridad: toda lectura y escritura exige la sesión firmada por /api/ws (salvo el aviso de intento de ingreso), y el
// servidor filtra cada colección para que cada usuario vea solo lo suyo (y lo de su grupo de inventario).
import { getStore } from "@netlify/blobs";

/* ===== Autenticación y permisos (incluido aquí para que la función no dependa de otros archivos) ===== */
// SIGISAC ERP · autenticación y permisos del lado del servidor (compartido por las funciones de Netlify).
// - El ingreso se valida aquí con el hash PBKDF2 guardado en la base central (la clave nunca viaja guardada).
// - Se emite un token firmado (HMAC-SHA256) que vence a las 12 h y queda invalidado si la clave cambia o el usuario se bloquea.
// - Cada petición vuelve a leer el usuario en la base central, así un usuario eliminado o bloqueado pierde el acceso al instante.
import { timingSafeEqual, randomBytes, webcrypto } from "node:crypto";
const subtle = webcrypto.subtle; // compatible con cualquier versión de Node de Netlify (no depende del crypto global)

const H = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const res = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: H });
const enc = new TextEncoder();
const dbStore = () => getStore({ name: "sigisac-db", consistency: "strong" });
const privStore = () => getStore({ name: "sigisac-priv", consistency: "strong" });

const usrId = u => /^[A-Za-z0-9_\-~:@+]{1,120}$/.test(u) ? u : "x" + [...enc.encode(String(u))].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 190);
const wsDe = user => user === "admin" ? "state" : "ws-" + usrId(user);
const esInv = u => !!u && (u.tipo === "inventario" || (Array.isArray(u.modulos) && u.modulos.length === 1 && u.modulos[0] === "Inventario físico/campo"));
const esAdmin = u => !!u && (u.user === "admin" || ((u.modulos || []).includes("Todos") && /Administrador/i.test(u.cargo || "")));
const ADMIN0 = { user: "admin", nombre: "Administrador SIGISAC ERP PROFESIONAL", cargo: "Administrador del sistema", modulos: ["Todos"], def: true, clave: "" };
const ADMIN0_PASS = "sigisac2026"; // solo mientras el administrador aún no existe en la base central (igual que la instalación inicial)

let SECRET = null;
async function secreto() {
  if (process.env.SIGISAC_SECRET) return process.env.SIGISAC_SECRET;
  if (SECRET) return SECRET;
  const st = privStore(); let s = await st.get("secret");
  if (!s) { await st.set("secret", randomBytes(32).toString("base64url"), { onlyIfNew: true }); s = await st.get("secret"); }
  return SECRET = s;
}
async function hmac(m) { const k = await subtle.importKey("raw", enc.encode(await secreto()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return Buffer.from(await subtle.sign("HMAC", k, enc.encode(m))).toString("base64url"); }
const iguales = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const huella = clave => String(clave || "default").slice(-16);

async function claveOk(pass, clave) {
  try { const [alg, it, s, d] = String(clave || "").split("$"); if (alg !== "pbkdf2_sha256" || !(+it > 0)) return false;
    const k = await subtle.importKey("raw", enc.encode(String(pass)), "PBKDF2", false, ["deriveBits"]);
    const dk = Buffer.from(await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: Buffer.from(s, "base64"), iterations: +it }, k, 256));
    const ref = Buffer.from(d, "base64"); return ref.length === dk.length && timingSafeEqual(dk, ref); } catch { return false; }
}
async function usuarios() { const c = await dbStore().get("col/usuarios", { type: "json" }); return c?.docs || {}; }
function adminDe(docs) { return Object.values(docs).find(x => x?.user === "admin"); }
function perfil(u) { return { ...u, ws: u.ws || wsDe(u.user), inv: esInv(u), admin: esAdmin(u) }; }

/* Ingreso: usuario, DNI o correo + clave */
async function ingresar(user, pass) {
  user = String(user || "").trim(); if (!user || !pass) return null; const docs = await usuarios();
  let cands = Object.values(docs).filter(x => x && (x.user === user || (x.dni && x.dni === user) || (x.correo && x.correo.toLowerCase() === user.toLowerCase())));
  for (const u of cands) if (await claveOk(pass, u.clave)) return u.bloq ? { bloqueado: true } : perfil(u);
  if (user === "admin" && !adminDe(docs) && pass === ADMIN0_PASS) return perfil(await crearAdmin(pass));
  return null;
}
/* Primera vez: el administrador inicial queda registrado en la base central con su clave cifrada (PBKDF2) */
async function crearAdmin(pass) {
  const salt = randomBytes(16), k = await subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
  const dk = Buffer.from(await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 120000 }, k, 256));
  const doc = { ...ADMIN0, clave: `pbkdf2_sha256$120000$${salt.toString("base64")}$${dk.toString("base64")}`, upd: new Date().toISOString(), ws: "state" };
  for (let i = 0; i < 8; i++) { const r = await dbStore().getWithMetadata("col/usuarios", { type: "json" }); const cur = r?.data || { v: 0, docs: {} };
    const ya = adminDe(cur.docs); if (ya) return ya; cur.docs.admin = doc; cur.v = (cur.v || 0) + 1;
    const w = await dbStore().setJSON("col/usuarios", cur, r?.etag ? { onlyIfMatch: r.etag } : { onlyIfNew: true }); if (w?.modified !== false) return doc; }
  return doc;
}
async function emitir(u) { const p = { u: u.user, h: huella(u.clave), exp: Date.now() + 12 * 3600 * 1000 }; const b = Buffer.from(JSON.stringify(p)).toString("base64url"); return { token: b + "." + await hmac(b), exp: p.exp }; }

/* Sesión de la petición: token válido + usuario vigente en la base central */
async function sesion(req) {
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim(); const [b, s] = tok.split(".");
  if (!b || !s || !iguales(s, await hmac(b))) return null;
  let p; try { p = JSON.parse(Buffer.from(b, "base64url").toString()); } catch { return null; }
  if (!p?.u || !(p.exp > Date.now())) return null;
  const docs = await usuarios(); let u = docs[usrId(p.u)];
  if (!u && p.u === "admin" && !adminDe(docs)) u = ADMIN0;
  if (!u || u.user !== p.u || u.bloq || huella(u.clave) !== p.h) return null;
  return { ...perfil(u), docs };
}
/* ===== Fin de autenticación ===== */


const NOMBRE = /^[A-Za-z0-9_\-]{1,40}$/;
const MAX_DOC = 300_000, MAX_COL = 20_000_000;
const LEGADO = c => c === "wsman" || c.startsWith("wsd_"); // primera versión de la sincronización: ahora vive en /api/ws
const SOLO_ADMIN = new Set(["planes", "seguridad"]);       // lectura para todos los usuarios; escritura solo del administrador

/* Grupo de trabajo: el usuario principal y sus usuarios de inventario comparten Campo, entidades y avisos */
function grupo(s) { const raiz = s.inv ? (s.padre || s.user) : s.user, g = new Set([s.user, raiz]);
  for (const u of Object.values(s.docs || {})) if (u?.padre === raiz) g.add(u.user); return g; }
function visible(c, d, s, g) {
  if (s.admin && c !== "campo" && c !== "campo_reset") return true;
  switch (c) {
    case "usuarios": return true;
    case "planes": case "seguridad": return true;
    case "mensajes": return d.de === s.user || d.para === "*" || d.para === s.user;
    case "alertas": return d.user === s.user || g.has(d.user);
    case "ingresos": case "entreg": case "campo": case "campo_reset": return g.has(d.user);
    default: return g.has(d.user) || d.user == null;
  }
}
function sinClave(u) { const { clave, ...r } = u || {}; return r; }

async function manejar(req) {
  const store = getStore({ name: "sigisac-db", consistency: "strong" });
  const url = new URL(req.url);
  if (req.method === "GET") {
    const c = url.searchParams.get("c") || "";
    if (c === "_ping") return res({ sigisac: 1, ok: true, auth: true });
    if (!NOMBRE.test(c)) return res({ error: "colección no válida" }, 400);
    if (LEGADO(c)) return res({ error: "colección no disponible" }, 403);
    const s = await sesion(req); if (!s) return res({ error: "Sesión requerida", auth: false }, 401);
    const cur = (await store.get("col/" + c, { type: "json" })) || { v: 0, docs: {} };
    if (Number(url.searchParams.get("v")) === cur.v) return res({ same: true, v: cur.v });
    const g = grupo(s), docs = {};
    for (const [id, d] of Object.entries(cur.docs || {})) if (d && visible(c, d, s, g)) docs[id] = c === "usuarios" ? sinClave(d) : d;
    return res({ v: cur.v, docs });
  }
  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch { return res({ error: "JSON no válido" }, 400); }
    const { op, c, id } = b || {}; let data = b?.data;
    if (!NOMBRE.test(c || "") || c === "_ping" || LEGADO(c)) return res({ error: "colección no válida" }, 400);
    if (typeof id !== "string" || !id || id.length > 200) return res({ error: "id no válido" }, 400);
    if (op !== "set" && op !== "del") return res({ error: "operación no válida" }, 400);
    if (op === "set" && (typeof data !== "object" || data === null || Array.isArray(data))) return res({ error: "documento no válido" }, 400);
    if (op === "set" && JSON.stringify(data).length > MAX_DOC) return res({ error: "documento demasiado grande" }, 413);
    const s = await sesion(req);
    if (!s && !(c === "alertas" && op === "set")) return res({ error: "Sesión requerida", auth: false }, 401); // el aviso de intento de ingreso se registra sin sesión
    for (let i = 0; i < 8; i++) { // escritura con control de concurrencia (etag): nunca se pisa el cambio de otro dispositivo
      const r = await store.getWithMetadata("col/" + c, { type: "json" });
      const cur = r?.data || { v: 0, docs: {} }, prev = cur.docs[id];
      const neg = s ? permiso(c, op, id, data, prev, s) : (prev ? "El aviso ya existe" : "");
      if (typeof neg === "string" && neg) return res({ error: neg }, 403);
      if (neg && typeof neg === "object") data = neg;
      if (op === "set") cur.docs[id] = data; else delete cur.docs[id];
      cur.v = (cur.v || 0) + 1;
      if (JSON.stringify(cur).length > MAX_COL) return res({ error: "colección llena" }, 413);
      const w = await store.setJSON("col/" + c, cur, r?.etag ? { onlyIfMatch: r.etag } : { onlyIfNew: true });
      if (w === undefined || w?.modified !== false) return res({ ok: true, v: cur.v });
      await new Promise(t => setTimeout(t, 40 + Math.random() * 120));
    }
    return res({ error: "conflicto de escritura, reintente" }, 409);
  }
  return res({ error: "método no permitido" }, 405);
}

/* Devuelve "" si se permite, un texto con el motivo si se rechaza, o el documento corregido que se debe guardar */
function permiso(c, op, id, data, prev, s) {
  const g = grupo(s);
  if (c === "usuarios") {
    const nuevo = op === "set" ? data : null; if (nuevo && usrId(String(nuevo.user || "")) !== id) return "El documento no corresponde al usuario";
    const keep = x => nuevo && !nuevo.clave && prev?.clave ? { ...x, clave: prev.clave } : x; // la lista llega sin claves: nunca se borra una clave
    if (s.admin) return op === "del" ? (prev?.user === "admin" ? "No se puede eliminar al administrador" : "") : keep(nuevo);
    if (id === usrId(s.user)) { if (op === "del") return "No puede eliminar su propio usuario";
      const fijo = ["user", "modulos", "tipo", "padre", "ws", "plan", "bloq", "def", "cargo", "libre", "srv", "invEquipo"]; const out = { ...nuevo }; fijo.forEach(k => { if (prev && k in prev) out[k] = prev[k]; else delete out[k]; });
      out.user = s.user; return keep(out); }
    if (!s.inv) { if (!s.invEquipo) return "Su usuario no está autorizado para registrar inventariadores (Autorización › Usuario principal)";
      const mio = x => x && x.tipo === "inventario" && x.padre === s.user;
      if (prev && !mio(prev)) return "Solo puede administrar sus propios usuarios de inventario";
      if (op === "del") return prev ? "" : "No existe";
      if (!mio(nuevo)) return "Solo puede crear usuarios de inventario a su cargo";
      return keep({ ...nuevo, ws: s.ws, modulos: ["Inventario físico/campo"], plan: "" }); }
    return "Sin permiso para administrar usuarios";
  }
  if (SOLO_ADMIN.has(c)) return s.admin ? "" : "Solo el administrador puede modificar esta configuración";
  if (op === "del") { if (s.admin && c !== "campo" && c !== "campo_reset") return ""; return !prev || g.has(prev.user) || prev.de === s.user ? "" : "Sin permiso para eliminar este registro"; }
  if (prev && !s.admin && !(g.has(prev.user) || prev.de === s.user)) return "Sin permiso para modificar este registro";
  if (c === "mensajes") return { ...data, de: s.user };
  if (c === "alertas") return data;
  return { ...data, user: g.has(data.user) ? data.user : s.user };
}

/* CORS: los demás enlaces de SIGISAC (p. ej. sigisacerp.netlify.app o su dominio propio) usan esta misma base central.
   Solo se aceptan orígenes de SIGISAC; la información sigue protegida por la sesión firmada de cada usuario. */
const ORIGEN_OK = /^https:\/\/([a-z0-9-]+\.)*(netlify\.app|demosigisac\.com|sigisac\.com|sigisacerp\.com)$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
function conCors(req, r) { const o = req.headers.get("origin"); if (o && ORIGEN_OK.test(o)) { const h = new Headers(r.headers);
    h.set("Access-Control-Allow-Origin", o); h.set("Vary", "Origin"); h.set("Access-Control-Allow-Headers", "Authorization, Content-Type"); h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); h.set("Access-Control-Max-Age", "86400");
    return new Response(r.body, { status: r.status, headers: h }); } return r; }
export default async (req) => req.method === "OPTIONS" ? conCors(req, new Response(null, { status: 204 })) : conCors(req, await manejar(req));
export const config = { path: "/api/db" };
