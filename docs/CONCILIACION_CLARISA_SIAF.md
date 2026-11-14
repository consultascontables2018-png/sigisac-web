# Análisis 1503 · Conciliación con CLARISA y Data SIAF Web

Ubicación: Saneamiento contable 1503 › Análisis › botones **Reporte CLARISA** y **Data SIAF Web**.
Todo trabaja sobre el inventario valorizado del saneamiento. No modifica el inventario de los usuarios ni los archivos fuente.

## 1. Importación (Excel .xlsx/.xls o TXT/CSV)

**CLARISA («Detalle de operaciones», grupo 15): solo se usan las columnas resaltadas en amarillo** (las demás no se usan):
- **Debe** (importe)
- **Docum. Compromiso** (tipo: solo «O/C» se trata como orden de compra; O/S u otros no)
- **Nro. Docum. Compromiso** (N° de O/C, p. ej. 0000805 → 805)
- **Cuenta contable**: la columna SubCta3, con el nivel más detallado (p. ej. 1503.020101). Viene en la fila de cabecera de cuenta y se aplica a sus líneas de detalle. Se reconoce por contenido aunque no tenga encabezado propio.
- **Año** y **SIAF (Exp.)**: la celda «2019  0000004575» trae el año y el expediente juntos (se verifica y se separa). También se aceptan en columnas separadas.

Reglas de lectura:
- Las filas de grupo, cuenta, mes y subtotales no son operaciones: se omiten.
- Las líneas bajo **APERTURA** (00) y **CIERRE** (13) son saldos: se omiten y se informan como aviso.
- Los movimientos sin importe en Debe (solo Haber) se omiten.
- Como no se usa el mes, no se compara el mes. Los registros sin O/C buscan candidatos por año y cuenta y siempre quedan pendientes de revisión.

- **Detección automática:** se detecta la hoja y la fila de encabezados, y las columnas se reconocen por su encabezado.
- **Referencias iniciales de CLARISA:** se aplican solo si el encabezado no identifica la columna y su contenido es válido.
  - T = DOC. COMPROMISO (O/C)
  - E = cuenta contable
  - G = año
  - H = expediente SIAF
  - El mes se busca por su encabezado.
- **Validación antes de procesar:** el usuario confirma o cambia la equivalencia de columnas. Se valida el contenido de cada columna:
  - año (1990–2100)
  - mes (1–12 o nombre)
  - expediente (se rechaza si parece año o mes)
  - cuenta
  - importe
- Una misma columna no puede asignarse a dos campos. Única excepción: año y mes tomados de una columna de fechas, verificada.
- **Equivalencia guardada:** la equivalencia se puede recordar por reporte.
- **Datos originales:** se conserva la fila original (`raw`) y el número de fila del archivo.
- **Errores:**
  - Filas con año o importe inválido, o de otra entidad: se excluyen y se informan.
  - Filas sin mes o sin cuenta: se incluyen con aviso.
- **Sin duplicados:** una carga nueva reemplaza la anterior del mismo reporte. El mismo archivo (huella) no se vuelve a cargar; solo se ofrece «Volver a conciliar».

## 2. Cruce (ambos sentidos)

- **Clave:** entidad + año de registro + N° de O/C (normalizado: sin prefijos, espacios ni ceros a la izquierda; el texto original se conserva). Nunca se relacionan años distintos.
- **Registro patrimonial — columna «Documento adquisición»:** se lee como N° de O/C tanto con prefijo («O/C 923», «O/CN°426-2016») como sin él.
  - «459» → O/C 459, con el año de la fecha de alta.
  - «1-2022» y «26-2021» → O/C 1 y 26, con el año que trae (2022, 2021).
  - Boletas, facturas, NEA, acuerdos, O/S y textos («S/D», «SIN DOCUMENTO») no se toman como O/C.
- **Agrupación por O/C + cuenta contable:**
  1. Para cada cuenta del reporte dentro de la O/C, se suman los bienes del Registro patrimonial de la misma O/C, año y cuenta (uno solo o varios).
  2. Si la suma es igual al total del reporte en esa O/C y cuenta, la operación queda **Conciliada**.
  3. Si además la clase del catálogo y el umbral UIT no exigen revisión, se registra en **Registro contable (valor y cuenta)** tal como está: el valor de cada bien y la misma cuenta.
- **Diferencia de cuenta:** solo si no hay correspondencia exacta. Cuando queda una sola cuenta del reporte sin conciliar en esa O/C, se comparan los bienes restantes; si el importe coincide, se evalúa la corrección (punto 4).
- **Sin coincidencia:**
  - Los bienes de la O/C con otra cuenta (p. ej. 9105 cuando CLARISA es del grupo 15) quedan como «O/C no figura en el reporte», con la explicación.
  - Si quedan varias cuentas sin correspondencia única, el resultado es **Agrupación ambigua**. Nunca se agrupa solo porque los importes sumen igual.
- **Importes:** se comparan a 2 decimales. Si difieren → **Diferencia de importe** (no conciliado).
- **Cada bien se usa una sola vez.**

## 3. Notas contables sin O/C

- Los candidatos son los bienes del mismo año, mes y cuenta, aún no conciliados.
- Se concilia solo si hay un único bien con el mismo importe **y** evidencia documental: código citado, mismo documento o descripción coincidente.
- En los demás casos el resultado es **Pendiente de revisión**, sin correcciones.

## 4. Corrección de cuentas

- Aplica cuando la operación está conciliada y la cuenta del reporte difiere de la del Registro patrimonial.
- Se propone la cuenta patrimonial solo si se cumplen las tres condiciones:
  - figura en el plan de cuentas;
  - corresponde a la clase del catálogo;
  - respeta el umbral de 1/8 UIT (hasta 2015) o 1/4 UIT (desde 2016), según el valor unitario del bien.
- La UIT se toma de la tabla configurable (Reclasificación). Si falta el año, la corrección queda pendiente.
- Si la diferencia es solo por umbral, la corrección queda pendiente; no se reclasifica automáticamente.
- La cuenta propuesta va a «Corrección de cuenta contable». Se guardan la cuenta original (`corrDe`) y el motivo (`corrMot`).

## 5. Volcado al Análisis

| Estado | Valor y cuenta contable | Corrección | SIAF |
|---|---|---|---|
| Conciliado | sí | en blanco | expedientes |
| Conciliado · corrección propuesta | sí | cuenta patrimonial validada | expedientes |
| Conciliado · corrección pendiente | sí | en blanco (observación) | expedientes |
| Conciliado por nota contable | sí | en blanco | expedientes |
| Diferencia de importe / mes | solo si es 1 bien ↔ 1 registro | en blanco | en blanco |
| Agrupación ambigua / Pendiente | no | en blanco | en blanco |
| O/C no figura en el reporte / Bien sin O/C | no | en blanco | en blanco |

- Lo escrito a mano no se sobrescribe.
- La columna «Estado conciliación» muestra el estado por reporte.
- La matriz «Conciliación … – Registro patrimonial» (Excel/PDF) muestra:
  - estado, sentido, año, meses y O/C de ambas fuentes;
  - bienes, cuentas de ambas fuentes, importes, diferencia;
  - corrección propuesta, SIAF;
  - filas de origen, archivo y sustento.
- **Eliminar** quita el reporte, su matriz y los datos que llenó. Conserva lo escrito a mano y lo del otro reporte.

## 6. Data SIAF Web (antes «Reporte SIAF Landing»)

- **Importación:** el botón **Data SIAF Web** selecciona la **carpeta** de datos del SIAF (p. ej. «Data_siaf_UE821_26102026»). Se leen todos sus archivos: tablas DBF (Visual FoxPro/dBase), TXT/CSV, Excel y ZIP.
  - De cada DBF se lee primero la estructura y se procesan las tablas con campos contables (año, mes, expediente, cuenta, nota, O/C, importe).
  - Las demás tablas y archivos (índices .CDX, tablas de personal, etc.) se informan como no aplicables.
  - Los registros marcados como eliminados en el DBF no se toman.
- **Desplegables «Cuenta contable» y «Año»** junto al botón Data SIAF Web (reemplazan al antiguo botón «Archivo»):
  - Se llenan solos con las cuentas y los años reconocidos al cargar la data SIAF.
  - Las cuentas incluyen las cuentas mayores (p. ej. 1503 con todas sus subcuentas).
  - Filtran la tabla, los reportes Excel/PDF y el resumen de **operaciones por año** (cantidad y valor por año, con filtro por clic).
  - **Enlazados:** al cambiar el **Año**, el desplegable **Cuenta contable** muestra solo las cuentas con registros en ese año. Si la cuenta elegida no tiene registros en el año nuevo, vuelve a «todas».
  - A continuación del Año están los botones **Vista PDF** y **Excel**, que generan el reporte de la cuenta y el año seleccionados. No hay conexión directa con el SIAF: no existe una interfaz oficial autorizada y el sistema no usa credenciales.
- **Columnas que se reconocen por su encabezado:** año, mes, N° SIAF (expediente), cuenta contable, nota contable, N° de orden de compra y valor del registro.
- **Solo registros válidos:** deben tener año, mes (1–12), cuenta contable y valor distinto de cero.
  - Se omiten apertura (00), cierre (13), anulados y extornos.
  - Las filas con año, mes o cuenta inválidos se informan como error.
- **Desplegable de cuentas contables:** permite elegir todas las cuentas, una cuenta mayor (p. ej. 1503 con todas sus subcuentas) o una subcuenta.
- **Reporte por cuenta contable (Excel y PDF):** formato similar al Detalle de operaciones de CLARISA.
  - Estructura: cuenta → año y mes → registros, con subtotal por mes, total por cuenta y total general.
  - Columnas: N°, año, mes, N° SIAF, cuenta contable, nota contable, N° de orden de compra y valor del registro.
- **Reconocimiento automático (sin ventana de columnas):** al elegir la carpeta, el sistema localiza solo la tabla DBF que contiene la cuenta mayor 1503.
  1. Lee la estructura de todas las tablas.
  2. De las que tienen año e importe, toma muestras del inicio, medio y final, y busca cuentas 1503… (o MAYOR = 1503 con sus campos de subcuenta). Prioriza las tablas contables: ctb_*, diario, operacion contable.
  3. Asigna año, mes, expediente, nota, O/C e importe por el nombre del campo.
  4. Si hay Debe/Haber o un indicador D/H, toma solo el Debe.
  5. Recorre la tabla por bloques y conserva solo los registros de la 1503, por año. Los registros eliminados no se toman.
  - Si algo no se puede identificar, se informa el motivo.
- **Información del «Detalle de operaciones Grupo 15» (formato CLARISA), por ejercicio:**
  - Columnas: cuenta y subcuentas, mes (00 APERTURA … 13 CIERRE), expediente, ciclo/fase (CC, GD), Debe, Haber, monto de la operación, tipo de operación, tipo de recurso, actividad/proyecto y secuencia funcional.
  - También: documento y N° de compromiso (O/C), RUC, proveedor, fecha y documento del devengado, N° de documento, comprobantes de pago (C/P) y observación.
  - Los datos que no están en la tabla contable se relacionan por año + expediente desde las tablas de documentos y comprobantes. El proveedor sale por RUC y el nombre del documento por su código. El nombre de las cuentas sale del maestro de cuentas de la data.
- **Reporte Excel/PDF:** sigue la estructura ejercicio → 1503 → subcuentas → mes → operaciones, con Debe y Haber por nivel y total general.
- **Solo se procesa; no se concilia.** Data SIAF Web es la lectura y el reporte de la cuenta 1503 por año, en Excel o PDF.
