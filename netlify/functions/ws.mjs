// SIGISAC ERP · base de trabajo central de cada usuario (entidades, SIGA MP, SINABIP, inventario, balance, campo…).
// Cada usuario solo puede leer y escribir SU base (ws). Los usuarios de inventario leen la base de su usuario principal.
// La base se guarda por versiones: partes (p/<ws>/<ver>/<i>) + manifiesto (m/<ws>) + historial (h/<ws>).
// El manifiesto se escribe con control de concurrencia (etag): si otro dispositivo guardó antes, se responde 409 y
// el navegador incorpora primero ese cambio. La hora de cada versión la pone el servidor.
import { getStore } from "@netlify/blobs";
import { H, res, sesion, ingresar, emitir, dbStore, usrId } from "../lib/sigauth.mjs";

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

export default async (req) => {
  const url = new URL(req.url);
  try {
    if (req.method === "POST") {
      let b; try { b = await req.json(); } catch { return res({ error: "JSON no válido" }, 400); }
      if (b?.op === "login") { const u = await ingresar(b.user, b.pass);
        if (!u) { await new Promise(r => setTimeout(r, 350)); return res({ error: "Usuario o contraseña incorrectos." }, 401); }
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
};
export const config = { path: "/api/ws" };
