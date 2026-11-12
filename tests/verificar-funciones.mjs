// Verifica que cada función exporte su ruta pública (sin esto Netlify responde 404 en /api/db o /api/ws)
import { readFileSync } from "node:fs";
let ok = true;
for (const [f, ruta] of [["netlify/functions/db.mjs", "/api/db"], ["netlify/functions/ws.mjs", "/api/ws"]]) {
  const s = readFileSync(f, "utf8");
  if (!s.includes(`export const config = { path: "${ruta}" }`)) { console.error(`FALTA la ruta ${ruta} en ${f}`); ok = false; }
  if (!/export default/.test(s)) { console.error(`FALTA export default en ${f}`); ok = false; }
  if (/from "\.\.\//.test(s)) { console.error(`${f} depende de otro archivo`); ok = false; }
}
console.log(ok ? "Funciones: rutas /api/db y /api/ws declaradas" : "Funciones con errores"); process.exit(ok ? 0 : 1);
