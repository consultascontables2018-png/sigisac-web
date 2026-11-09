// SIGISAC ERP · base compartida para el sitio en Netlify (Netlify Functions + Netlify Blobs).
// Guarda cada colección (usuarios, alertas, mensajes, ingresos, entreg, campo, planes…) como un documento JSON
// con número de versión; el navegador consulta cada pocos segundos y solo descarga cuando hubo cambios.
import { getStore } from "@netlify/blobs";

const NOMBRE = /^[A-Za-z0-9_\-]{1,40}$/;
const H = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const res = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: H });
const MAX_DOC = 300_000, MAX_COL = 20_000_000;

export default async (req) => {
  const store = getStore({ name: "sigisac-db", consistency: "strong" });
  const url = new URL(req.url);
  if (req.method === "GET") {
    const c = url.searchParams.get("c") || "";
    if (c === "_ping") return res({ sigisac: 1, ok: true });
    if (!NOMBRE.test(c)) return res({ error: "colección no válida" }, 400);
    const cur = (await store.get("col/" + c, { type: "json" })) || { v: 0, docs: {} };
    if (Number(url.searchParams.get("v")) === cur.v) return res({ same: true, v: cur.v });
    return res(cur);
  }
  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch { return res({ error: "JSON no válido" }, 400); }
    const { op, c, id, data } = b || {};
    if (!NOMBRE.test(c || "") || c === "_ping") return res({ error: "colección no válida" }, 400);
    if (typeof id !== "string" || !id || id.length > 200) return res({ error: "id no válido" }, 400);
    if (op !== "set" && op !== "del") return res({ error: "operación no válida" }, 400);
    if (op === "set" && (typeof data !== "object" || data === null || Array.isArray(data))) return res({ error: "documento no válido" }, 400);
    if (op === "set" && JSON.stringify(data).length > MAX_DOC) return res({ error: "documento demasiado grande" }, 413);
    for (let i = 0; i < 8; i++) { // escritura con control de concurrencia (etag): nunca se pisa el cambio de otro dispositivo
      const r = await store.getWithMetadata("col/" + c, { type: "json" });
      const cur = r?.data || { v: 0, docs: {} };
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

export const config = { path: "/api/db" };
