// SIGISAC ERP · autenticación y permisos del lado del servidor (compartido por las funciones de Netlify).
// - El ingreso se valida aquí con el hash PBKDF2 guardado en la base central (la clave nunca viaja guardada).
// - Se emite un token firmado (HMAC-SHA256) que vence a las 12 h y queda invalidado si la clave cambia o el usuario se bloquea.
// - Cada petición vuelve a leer el usuario en la base central, así un usuario eliminado o bloqueado pierde el acceso al instante.
import { getStore } from "@netlify/blobs";
import { timingSafeEqual, randomBytes, webcrypto } from "node:crypto";
const subtle = webcrypto.subtle; // compatible con cualquier versión de Node de Netlify (no depende del crypto global)

export const H = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
export const res = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: H });
const enc = new TextEncoder();
export const dbStore = () => getStore({ name: "sigisac-db", consistency: "strong" });
const privStore = () => getStore({ name: "sigisac-priv", consistency: "strong" });

export const usrId = u => /^[A-Za-z0-9_\-~:@+]{1,120}$/.test(u) ? u : "x" + [...enc.encode(String(u))].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 190);
export const wsDe = user => user === "admin" ? "state" : "ws-" + usrId(user);
export const esInv = u => !!u && (u.tipo === "inventario" || (Array.isArray(u.modulos) && u.modulos.length === 1 && u.modulos[0] === "Inventario físico/campo"));
export const esAdmin = u => !!u && (u.user === "admin" || ((u.modulos || []).includes("Todos") && /Administrador/i.test(u.cargo || "")));
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

export async function claveOk(pass, clave) {
  try { const [alg, it, s, d] = String(clave || "").split("$"); if (alg !== "pbkdf2_sha256" || !(+it > 0)) return false;
    const k = await subtle.importKey("raw", enc.encode(String(pass)), "PBKDF2", false, ["deriveBits"]);
    const dk = Buffer.from(await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: Buffer.from(s, "base64"), iterations: +it }, k, 256));
    const ref = Buffer.from(d, "base64"); return ref.length === dk.length && timingSafeEqual(dk, ref); } catch { return false; }
}
export async function usuarios() { const c = await dbStore().get("col/usuarios", { type: "json" }); return c?.docs || {}; }
function adminDe(docs) { return Object.values(docs).find(x => x?.user === "admin"); }
export function perfil(u) { return { ...u, ws: u.ws || wsDe(u.user), inv: esInv(u), admin: esAdmin(u) }; }

/* Ingreso: usuario, DNI o correo + clave */
export async function ingresar(user, pass) {
  user = String(user || "").trim(); if (!user || !pass) return null; const docs = await usuarios();
  let cands = Object.values(docs).filter(x => x && (x.user === user || (x.dni && x.dni === user) || (x.correo && x.correo.toLowerCase() === user.toLowerCase())));
  for (const u of cands) if (!u.bloq && await claveOk(pass, u.clave)) return perfil(u);
  if (user === "admin" && !adminDe(docs) && pass === ADMIN0_PASS) return perfil(await crearAdmin(pass));
  return null;
}
/* Primera vez: el administrador inicial queda registrado en la base central con su clave cifrada (PBKDF2) */
async function crearAdmin(pass) {
  const salt = randomBytes(16), k = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
  const dk = Buffer.from(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 120000 }, k, 256));
  const doc = { ...ADMIN0, clave: `pbkdf2_sha256$120000$${salt.toString("base64")}$${dk.toString("base64")}`, upd: new Date().toISOString(), ws: "state" };
  for (let i = 0; i < 8; i++) { const r = await dbStore().getWithMetadata("col/usuarios", { type: "json" }); const cur = r?.data || { v: 0, docs: {} };
    const ya = adminDe(cur.docs); if (ya) return ya; cur.docs.admin = doc; cur.v = (cur.v || 0) + 1;
    const w = await dbStore().setJSON("col/usuarios", cur, r?.etag ? { onlyIfMatch: r.etag } : { onlyIfNew: true }); if (w?.modified !== false) return doc; }
  return doc;
}
export async function emitir(u) { const p = { u: u.user, h: huella(u.clave), exp: Date.now() + 12 * 3600 * 1000 }; const b = Buffer.from(JSON.stringify(p)).toString("base64url"); return { token: b + "." + await hmac(b), exp: p.exp }; }

/* Sesión de la petición: token válido + usuario vigente en la base central */
export async function sesion(req) {
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim(); const [b, s] = tok.split(".");
  if (!b || !s || !iguales(s, await hmac(b))) return null;
  let p; try { p = JSON.parse(Buffer.from(b, "base64url").toString()); } catch { return null; }
  if (!p?.u || !(p.exp > Date.now())) return null;
  const docs = await usuarios(); let u = docs[usrId(p.u)];
  if (!u && p.u === "admin" && !adminDe(docs)) u = ADMIN0;
  if (!u || u.user !== p.u || u.bloq || huella(u.clave) !== p.h) return null;
  return { ...perfil(u), docs };
}
