// SIGISAC ERP · base de trabajo central de cada usuario (entidades, SIGA MP, SINABIP, inventario, balance, campo…).
// Cada usuario solo puede leer y escribir SU base (ws). Los usuarios de inventario leen la base de su usuario principal.
// La base se guarda por versiones: partes (p/<ws>/<ver>/<i>) + manifiesto (m/<ws>) + historial (h/<ws>).
// El manifiesto se escribe con control de concurrencia (etag): si otro dispositivo guardó antes, se responde 409 y
// el navegador incorpora primero ese cambio. La hora de cada versión la pone el servidor.
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


const W = () => getStore({ name: "sigisac-ws", consistency: "strong" });
const WS = /^[A-Za-z0-9_\-~:@+]{1,200}$/, VER = /^[a-z0-9]{6,24}$/, PARTE = 1_200_000;
const puede = (s, ws, escribir) => !!s && ws === s.ws && !(escribir && s.inv);
const recortar = (h, t) => String(h || "").slice(0, t);

/* Retención: las 3 más recientes, una por día (7 días), la más completa y un tope de ~40 MB */
function podar(hist) {
  const keep = new Set(), dias = new Set(); let tot = 0;
  const rica = [...hist].sort((a, b) => (b.nb || 0) - (a.nb || 0))[0]; if (rica) keep.add(rica.ver);
  hist.forEach((v, i) => { const d = String(v.t).slice(0, 10); if ((i < 3 || (!dias.has(d) && dias.size < 7)) && (tot + (v.size || 0) < 40e6 || i < 2)) { keep.add(v.ver); dias.add(d); tot += v.size || 0; } });
  return { keep: hist.filter(v => keep.has(v.ver)), drop: hist.filter(v => !keep.has(v.ver)) };
}
async function borrarVer(ws, v) { for (let i = 0; i < (v.n || 0); i++) { try { await W().delete(`p/${ws}/${v.ver}/${i}`); } catch { } } }

/* Migración segura de la primera versión de la sincronización (colecciones wsman / wsd_<ws> de /api/db) */
async function migrarLegado(ws) {
  if (await W().get("mig/" + ws)) return null;
  const db = dbStore(); const man = (await db.get("col/wsman", { type: "json" }))?.docs?.[usrId(ws).slice(0, 60)];
  const col = (await db.get("col/" + ("wsd_" + ws.replace(/[^A-Za-z0-9_-]/g, "")).slice(0, 40), { type: "json" }))?.docs || {};
  const V = new Map(); for (const x of Object.values(col)) { if (!x?.ver) continue; const v = V.get(x.ver) || { ver: x.ver, p: [], nb: x.nb, nom: x.nom || "", t: x.t || "" }; v.p[x.i] = x.d; if (x.nb != null) v.nb = x.nb; if (x.nom) v.nom = x.nom; V.set(x.ver, v); }
  const hist = [];
  for (const v of V.values()) { const n = v.p.length; if (!n || v.p.some(d => typeof d !== "string")) continue; const data = v.p.join(""), partes = Math.ceil(data.length / PARTE);
    const ver = VER.test(v.ver) ? v.ver : v.ver.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24).padEnd(6, "0");
    for (let i = 0; i < partes; i++) await W().set(`p/${ws}/${ver}/${i}`, data.slice(i * PARTE, (i + 1) * PARTE));
    const t = v.t || (man && man.ver === v.ver ? man.t : new Date(parseInt(v.ver.slice(0, -3), 36) || Date.now()).toISOString());
    hist.push({ ver, n: partes, t, nb: v.nb ?? null, nom: v.nom, size: data.length, legado: true, actual: !!man && man.ver === v.ver }); }
  hist.sort((a, b) => String(b.t).localeCompare(String(a.t)));
  if (hist.length) { await W().setJSON("h/" + ws, hist); const act = hist.find(v => v.actual) || hist[0];
    await W().setJSON("m/" + ws, { ws, ver: act.ver, n: act.n, t: act.t, nb: act.nb, nom: act.nom, size: act.size, user: man?.user || "", nombre: man?.nombre || "", migrado: true }, { onlyIfNew: true }); }
  await W().set("mig/" + ws, new Date().toISOString());
  return hist.length;
}

async function manejar(req) {
  const url = new URL(req.url);
  try {
    if (req.method === "POST") {
      let b; try { b = await req.json(); } catch { return res({ error: "JSON no válido" }, 400); }
      if (b?.op === "login") { const u = await ingresar(b.user, b.pass);
        if (!u) { await new Promise(r => setTimeout(r, 350)); return res({ error: "Usuario o contraseña incorrectos." }, 401); }
        if (u.bloqueado) return res({ error: "Su usuario está bloqueado. Comuníquese con su usuario principal o con el administrador." }, 403);
        const { clave, ...pub } = u; return res({ ok: true, ...(await emitir(u)), perfil: { ...pub, clave } }); }
      const s = await sesion(req); if (!s) return res({ error: "Sesión no válida o vencida. Ingrese nuevamente." }, 401);
      const ws = String(b.ws || ""); if (!WS.test(ws)) return res({ error: "base no válida" }, 400);
      if (!puede(s, ws, true)) return res({ error: "No tiene permiso para modificar esta base de trabajo." }, 403);
      if (b.op === "put") { const i = +b.i; if (!VER.test(b.ver || "") || !(i >= 0 && i < 400) || typeof b.d !== "string" || b.d.length > PARTE) return res({ error: "parte no válida" }, 400);
        await W().set(`p/${ws}/${b.ver}/${i}`, b.d); return res({ ok: true }); }
      if (b.op === "commit") { const n = +b.n; if (!VER.test(b.ver || "") || !(n > 0 && n <= 400)) return res({ error: "versión no válida" }, 400);
        for (let i = 0; i < n; i++) if (!(await W().getMetadata(`p/${ws}/${b.ver}/${i}`))) return res({ error: `Falta la parte ${i + 1} de ${n}` }, 400);
        const cur = await W().getWithMetadata("m/" + ws, { type: "json" });
        if ((cur?.data?.ver || "") !== String(b.base || "")) return res({ conflict: true, man: cur?.data || null }, 409);
        const man = { ws, ver: b.ver, n, t: new Date().toISOString(), nb: +b.nb || 0, nom: recortar(b.nom, 200), size: +b.size || 0, dev: recortar(b.dev, 40), user: s.user, nombre: recortar(s.nombre, 120) };
        const w = await W().setJSON("m/" + ws, man, cur?.etag ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
        if (w?.modified === false) return res({ conflict: true, man: (await W().get("m/" + ws, { type: "json" })) || null }, 409);
        const hist = (await W().get("h/" + ws, { type: "json" })) || []; hist.unshift({ ver: man.ver, n, t: man.t, nb: man.nb, nom: man.nom, size: man.size, user: s.user });
        const { keep, drop } = podar(hist); await W().setJSON("h/" + ws, keep); for (const v of drop) await borrarVer(ws, v);
        return res({ ok: true, man }); }
      return res({ error: "operación no válida" }, 400);
    }
    if (req.method === "GET") {
      const op = url.searchParams.get("op") || "";
      if (op === "ping") return res({ sigisac: 1, ws: true });
      const s = await sesion(req); if (!s) return res({ error: "Sesión no válida o vencida. Ingrese nuevamente." }, 401);
      if (op === "yo") { const { clave, docs, ...pub } = s; return res({ ok: true, perfil: pub }); }
      const ws = url.searchParams.get("ws") || ""; if (!WS.test(ws)) return res({ error: "base no válida" }, 400);
      if (!puede(s, ws, false)) return res({ error: "No tiene permiso para ver esta base de trabajo." }, 403);
      if (op === "man") { let m = await W().get("m/" + ws, { type: "json" }); if (!m && await migrarLegado(ws)) m = await W().get("m/" + ws, { type: "json" }); return res({ ok: true, man: m || null }); }
      if (op === "hist") { await migrarLegado(ws); return res({ ok: true, hist: (await W().get("h/" + ws, { type: "json" })) || [] }); }
      if (op === "part") { const ver = url.searchParams.get("ver") || "", i = +url.searchParams.get("i"); if (!VER.test(ver) || !(i >= 0)) return res({ error: "parte no válida" }, 400);
        const d = await W().get(`p/${ws}/${ver}/${i}`); if (d == null) return res({ error: "parte no encontrada" }, 404);
        return new Response(d, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } }); }
      return res({ error: "operación no válida" }, 400);
    }
    return res({ error: "método no permitido" }, 405);
  } catch (e) { console.error(e); return res({ error: "Error del servidor: " + (e?.message || e) }, 500); }
}
/* CORS: los demás enlaces de SIGISAC (p. ej. sigisacerp.netlify.app o su dominio propio) usan esta misma base central.
   Solo se aceptan orígenes de SIGISAC; la información sigue protegida por la sesión firmada de cada usuario. */
const ORIGEN_OK = /^https:\/\/([a-z0-9-]+\.)*(netlify\.app|demosigisac\.com|sigisac\.com|sigisacerp\.com)$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
function conCors(req, r) { const o = req.headers.get("origin"); if (o && ORIGEN_OK.test(o)) { const h = new Headers(r.headers);
    h.set("Access-Control-Allow-Origin", o); h.set("Vary", "Origin"); h.set("Access-Control-Allow-Headers", "Authorization, Content-Type"); h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); h.set("Access-Control-Max-Age", "86400");
    return new Response(r.body, { status: r.status, headers: h }); } return r; }
export default async (req) => req.method === "OPTIONS" ? conCors(req, new Response(null, { status: 204 })) : conCors(req, await manejar(req));
export const config = { path: "/api/ws" };
