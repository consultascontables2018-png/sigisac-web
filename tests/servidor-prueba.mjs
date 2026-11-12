import http from 'node:http'; import fs from 'node:fs';
const db = (await import(process.env.FN + '/netlify/functions/db.mjs')).default, ws = (await import(process.env.FN + '/netlify/functions/ws.mjs')).default;
const html = process.argv[2];
import { getStore } from '@netlify/blobs'; import zlib from 'node:zlib'; import crypto from 'node:crypto';
async function seed() { const db = getStore({ name: 'sigisac-db' }); const salt = crypto.randomBytes(16), dk = crypto.pbkdf2Sync('l1', salt, 120000, 32, 'sha256');
  const u = (await db.get('col/usuarios', { type: 'json' })) || { v: 0, docs: {} }; u.docs.legado = { user: 'legado', nombre: 'USUARIO LEGADO', clave: `pbkdf2_sha256$120000$${salt.toString('base64')}$${dk.toString('base64')}`, modulos: ['Todos'], ws: 'ws-legado' }; u.v++; await db.setJSON('col/usuarios', u);
  const st = { ver: 3, inv: [{ cod: '1', den: 'MESA' }], base: [['', '', '', 'X1']], sinabip: [], bal: null, log: [], ents: { E1: null }, entId: 'E1', dueno: 'legado', cfg: { entidad: { nombre: 'ENTIDAD MIGRADA DESDE LA PRIMERA VERSION' }, corte: '2026-12-31', periodos: [], comision: [] } };
  const d = zlib.gzipSync(JSON.stringify(st)).toString('base64'), ver = 'mwab12c' + 'xyz'; const half = Math.ceil(d.length / 2);
  await db.setJSON('col/wsman', { v: 1, docs: { 'ws-legado': { ws: 'ws-legado', ver, n: 2, t: '2026-11-11T20:00:00.000Z', user: 'legado' } } });
  await db.setJSON('col/wsd_ws-legado', { v: 1, docs: { [ver + '_0']: { ver, i: 0, d: d.slice(0, half) }, [ver + '_1']: { ver, i: 1, d: d.slice(half) } } }); }
http.createServer(async (rq, rs) => {
  if (rq.url === '/__seed') { await seed(); rs.end('ok'); return; }
  const fn = rq.url.startsWith('/api/db') ? db : rq.url.startsWith('/api/ws') ? ws : null;
  if (fn) { const body = await new Promise(r => { let d = ''; rq.on('data', c => d += c); rq.on('end', () => r(d)); });
    const req = new Request('http://x' + rq.url, { method: rq.method, headers: rq.headers, body: rq.method === 'POST' ? body : undefined });
    const r = await fn(req); rs.writeHead(r.status, Object.fromEntries(r.headers)); rs.end(await r.text()); return; }
  rs.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); rs.end(fs.readFileSync(html));
}).listen(8810, () => console.log('listo'));
