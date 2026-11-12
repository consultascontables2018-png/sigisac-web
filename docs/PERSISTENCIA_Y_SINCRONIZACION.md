# SIGISAC ERP · Persistencia central y sincronización entre dispositivos

Fecha: 11/11/2026. Aplica al sitio publicado en Netlify (segisacerp). Commit con este cambio: ver historial de `main`.

## 1. Diagnóstico (causa del problema)

| Hallazgo | Efecto |
|---|---|
| La información de cada usuario (entidades, SIGA MP, SINABIP, inventario, balance) se guardaba **primero en IndexedDB del navegador**. La copia en la nube se agregó después, sobre `/api/db`, como una colección más. | Si la subida fallaba, el otro dispositivo no tenía nada que descargar y mostraba la base vacía. |
| `/api/db` guarda **cada colección como un único JSON** y lo devuelve completo en cada lectura. La base de trabajo se partía en trozos de 100 KB dentro de la colección `wsd_<ws>`, sumando todas sus versiones. | Con bases grandes (p. ej. 60 594 registros SIGA MP) la respuesta supera el límite de **6 MB de las funciones de Netlify**. La descarga falla en silencio y el usuario ve «sin entidades». |
| `/api/db` **no tenía autenticación**: cualquiera podía leer `usuarios` (con hashes de clave) o escribir cualquier documento. | Riesgo de acceso a información ajena y de suplantación. |
| El aviso «Su base de datos está lista / sin información» se mostraba **antes** de consultar la base central. | Se informaba «sin entidades» aunque los datos existían en el servidor. |
| Condición de carrera: si el usuario cambiaba algo mientras se aplicaba una descarga, ese cambio quedaba marcado como guardado. | Cambios que no llegaban a los otros dispositivos. |

## 2. Arquitectura nueva

```
Navegador (public/index.html)
 ├─ Ingreso ──► POST /api/ws {op:login}  → valida PBKDF2 en el servidor → token firmado (HMAC-SHA256, 12 h)
 ├─ Base de trabajo del usuario ──► /api/ws   (fuente de verdad, por usuario)
 │     GET  op=man   manifiesto vigente {ver, n, t, nb, nom, size}
 │     GET  op=part  parte i de la versión (≤ 1,2 MB, texto gzip+base64)
 │     POST op=put   sube una parte
 │     POST op=commit publica la versión: verifica partes + control de concurrencia (base = versión anterior)
 │     GET  op=hist  historial de versiones (recuperación)
 ├─ Colecciones compartidas (usuarios, campo, mensajes, ingresos, entreg, alertas, planes, seguridad) ──► /api/db
 │     todas exigen la sesión; el servidor filtra lo que cada usuario puede ver y valida cada escritura
 └─ IndexedDB: solo caché local / trabajo sin conexión y copias de seguridad recuperables
```

### Almacenamiento (Netlify Blobs)

| Store | Clave | Contenido |
|---|---|---|
| `sigisac-ws` | `m/<ws>` | Manifiesto vigente de la base del usuario (escrito con etag) |
| `sigisac-ws` | `p/<ws>/<ver>/<i>` | Partes de cada versión |
| `sigisac-ws` | `h/<ws>` | Historial (retención: 3 últimas, una por día durante 7 días, la más completa, tope ~40 MB) |
| `sigisac-ws` | `mig/<ws>` | Marca de migración de la primera versión |
| `sigisac-priv` | `secret` | Secreto de firma de tokens (o variable de entorno `SIGISAC_SECRET`) |
| `sigisac-db` | `col/<colección>` | Colecciones compartidas (sin cambios de formato) |

`<ws>` es el identificador de la base del usuario: `ws-<usuario>` (el administrador usa `state`). Los usuarios de inventario usan la `ws` de su usuario principal, **solo lectura**.

## 3. Seguridad (validada en el servidor)

- **Ingreso:** el servidor verifica la clave con el hash PBKDF2-SHA256 de la base central. Emite un token firmado que vence en 12 h. El token se invalida al cambiar la clave, bloquear o eliminar al usuario, porque en cada petición se vuelve a leer el usuario.
- **`/api/ws`:** cada usuario solo lee y escribe su propia `ws`. Los usuarios de inventario solo leen la de su principal. Cualquier otro intento devuelve 403.
- **`/api/db`:**
  - Toda lectura o escritura exige sesión. Única excepción: registrar un aviso de intento de ingreso.
  - `usuarios` se entrega **sin hashes de clave**.
  - Escrituras en `usuarios`:
    - el administrador puede todo, pero nunca borra una clave por omisión;
    - cada usuario solo puede cambiar sus datos y su clave, no su rol, módulos, plan ni cargo;
    - un usuario principal solo crea o edita sus propios usuarios de inventario.
  - `campo`, `ingresos`, `entreg`, `alertas`: cada usuario ve solo lo de su grupo (principal + inventariadores).
  - `mensajes`: solo los propios y los dirigidos a todos.
  - `planes` y `seguridad`: lectura para todos, escritura solo del administrador.
  - Las colecciones antiguas `wsman` / `wsd_*` quedan cerradas al público.

## 4. Comportamiento en el navegador

1. **Carga al ingresar:**
   - Tras validar la sesión, el sistema muestra «Cargando su información desde la base central…» y la etiqueta «Cargando entidades…».
   - Luego descarga la versión vigente.
   - Solo si la consulta **confirma** que no hay datos muestra «No tienes entidades registradas».
2. **Errores:**
   - Si falla la conexión, aparece el mensaje de error con **Reintentar**.
   - Si la sesión venció, aparece **Ingresar nuevamente**.
   - En ninguno de los dos casos se muestra «sin entidades».
3. **Guardado:**
   - Cada cambio se envía unos 2,5 s después.
   - «Guardado correctamente» aparece solo cuando el servidor confirma la versión.
   - Hay un solo envío a la vez, los reintentos son automáticos cada 15 s y se usan ids de versión únicos (sin duplicados).
4. **Tiempo real:**
   - Las otras sesiones consultan el manifiesto cada 4 s (y al volver a la pestaña).
   - Si hay una versión nueva, la descargan sin recargar la página.
5. **Conflictos:**
   - Si otro dispositivo guardó antes, el servidor responde 409.
   - El navegador incorpora esa versión, conserva los bienes verificados más recientes de este equipo y vuelve a guardar.
6. **Migración segura de datos existentes:**
   - *Datos solo en el navegador:* si la base central no tiene datos o tiene menos, y la base local pertenece al usuario (`dueno`), se sube la local. Nunca se reemplaza una base con información por una vacía.
   - *Datos de la primera versión de la sincronización* (`wsman` / `wsd_*`): se migran solos en el servidor la primera vez que el usuario consulta. Se conservan como historial recuperable.
   - Antes de reemplazar datos locales se guarda una copia en el navegador.
   - Todo se puede restaurar desde Configuración › Data › Recuperar base de trabajo.

## 5. Pruebas realizadas (resultado en `tests/resultados-2026-11-11.txt`)

Se usaron las funciones reales, Netlify Blobs simulado en memoria y navegadores Chromium independientes.

| Prueba | Resultado |
|---|---|
| Usuario registra entidad + 60 000 registros SIGA MP en el equipo A | Guardado confirmado por el servidor (2 partes, 1,05 MB) |
| Mismo usuario ingresa en el navegador B | Entidad y 60 000 registros aparecen solos |
| B modifica dirección y estado de un bien | A lo recibe sin recargar (≈ 5 s) |
| A crea una segunda entidad | B la recibe sin recargar |
| Cierre de sesión y reingreso | Los datos se mantienen |
| Otra cuenta intenta leer o escribir la base ajena | 403 / 403 |
| Otra cuenta intenta subirse privilegios o cambiar la clave ajena | Rechazado / cargo sin cambios |
| `/api/db` sin sesión | 401; las claves no se exponen |
| Inventariador | Ve la base de su principal, no puede escribirla (403); el principal ve sus registros de Campo; otra cuenta no |
| Carga lenta | Indicador «Cargando…», sin aviso de vacío |
| Servidor caído | Mensaje de error + Reintentar; sin aviso de vacío; recupera al reintentar |
| Sesión vencida | Mensaje + «Ingresar nuevamente» |
| Datos de la primera versión (`wsman` / `wsd_*`) | Migrados y visibles al ingresar |
| Guardar inventario (Campo) | «Guardado correctamente (confirmado por el servidor)» |
| Modo archivo local (sin servidor) | Funciona como antes, solo en el equipo |

Para repetirlas: `tests/ejecutar.sh` (Node 18+ y Playwright con Chromium).

## 6. Después de publicar

- Las sesiones abiertas antes de esta versión verán «Ingresar nuevamente». Al ingresar se obtiene la sesión con la base central.
- Un usuario creado solo en un equipo, nunca enviado a la base central, no puede sincronizar. El administrador debe guardarlo de nuevo en Autorización con sesión activa, o usar Exportar/Importar usuarios.
- Recomendado: definir la variable de entorno `SIGISAC_SECRET` en Netlify (Site settings › Environment variables). Si no existe, se genera un secreto y se guarda en Blobs.
- Pendiente: cambiar la clave inicial de `admin`.
- La versión que corre dentro de Claude (artifact) usa la base del propio artifact, que es privada de su dueño. Esta arquitectura con servidor aplica al sitio en Netlify.
