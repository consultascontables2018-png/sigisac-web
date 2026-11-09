# SIGISAC ERP Profesional V2.0.0 · Web (Netlify)

Sitio de SIGISAC ERP con base compartida propia (Netlify Functions + Netlify Blobs).

- `public/index.html`: el sistema.
- `netlify/functions/db.mjs`: la base compartida en `/api/db`, con usuarios, claves cifradas, alertas, mensajes, ingresos, entidades y Campo.
- Netlify: comando de compilación vacío y carpeta de publicación `public`. Cada cambio en `main` se publica solo.

Comprobación: `/api/db?c=_ping` debe responder `{"sigisac":1,"ok":true}`.
