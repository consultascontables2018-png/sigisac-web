const S = new Map(); let n = 0;
export function getStore(o = {}) { const nm = typeof o === 'string' ? o : o.name || 'x'; if (!S.has(nm)) S.set(nm, new Map()); const M = S.get(nm);
  const put = (k, raw, op = {}) => { const x = M.get(k); if (op.onlyIfMatch && (!x || x.e !== op.onlyIfMatch)) return { modified: false }; if (op.onlyIfNew && x) return { modified: false }; M.set(k, { v: raw, e: 'e' + (++n) }); return { modified: true, etag: 'e' + n }; };
  return {
  async get(k, op = {}) { const x = M.get(k); if (!x) return null; return op.type === 'json' ? JSON.parse(x.v) : x.v; },
  async getWithMetadata(k, op = {}) { const x = M.get(k); return x ? { data: op.type === 'json' ? JSON.parse(x.v) : x.v, etag: x.e, metadata: {} } : null; },
  async getMetadata(k) { const x = M.get(k); return x ? { etag: x.e, metadata: {} } : null; },
  async setJSON(k, v, op) { return put(k, JSON.stringify(v), op); },
  async set(k, v, op) { return put(k, String(v), op); },
  async delete(k) { M.delete(k); } }; }
