// SIGISAC ERP · base compartida del sitio en Netlify (Netlify Functions + Netlify Blobs).
// Guarda cada colección (usuarios, alertas, mensajes, ingresos, entreg, campo, planes…) como un documento JSON con
// número de versión; el navegador consulta cada pocos segundos y solo descarga cuando hubo cambios.
// Seguridad: toda lectura y escritura exige la sesión firmada por /api/ws (salvo el aviso de intento de ingreso), y el
// servidor filtra cada colección para que cada usuario vea solo lo suyo (y lo de su grupo de inventario).
import { getStore } from "@netlify/blobs";
import { res, sesion, usrId, esInv, esAdmin } from "../lib/sigauth.mjs";

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

export default async (req) => {
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
};

/* Devuelve "" si se permite, un texto con el motivo si se rechaza, o el documento corregido que se debe guardar */
function permiso(c, op, id, data, prev, s) {
  const g = grupo(s);
  if (c === "usuarios") {
    const nuevo = op === "set" ? data : null; if (nuevo && usrId(String(nuevo.user || "")) !== id) return "El documento no corresponde al usuario";
    const keep = x => nuevo && !nuevo.clave && prev?.clave ? { ...x, clave: prev.clave } : x; // la lista llega sin claves: nunca se borra una clave
    if (s.admin) return op === "del" ? (prev?.user === "admin" ? "No se puede eliminar al administrador" : "") : keep(nuevo);
    if (id === usrId(s.user)) { if (op === "del") return "No puede eliminar su propio usuario";
      const fijo = ["user", "modulos", "tipo", "padre", "ws", "plan", "bloq", "def", "cargo", "libre", "srv"]; const out = { ...nuevo }; fijo.forEach(k => { if (prev && k in prev) out[k] = prev[k]; else delete out[k]; });
      out.user = s.user; return keep(out); }
    if (!s.inv) { const mio = x => x && x.tipo === "inventario" && x.padre === s.user;
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
