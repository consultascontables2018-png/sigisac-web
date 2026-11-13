# Análisis 1503 · Conciliación con CLARISA y SIAF Landing

Ubicación: Saneamiento contable 1503 › Análisis › botones **Reporte CLARISA** y **Reporte SIAF Landing**.
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

- **Clave:** entidad + año de registro + N° de O/C.
  - El N° se normaliza: sin prefijos (O/C, OC, N°, ORDEN DE COMPRA), sin espacios y sin ceros a la izquierda.
  - El texto original se conserva.
- **Nunca se relacionan años distintos.** Si la O/C existe en otro año, se informa.
- **Del lado patrimonial:** el N° se toma de «Documento adquisición» (solo si es O/C) y el año y mes de la fecha de alta.
- **Varias partidas en una misma O/C:** se agrupan por mes + cuenta.
  - Cada bien se asigna a una partida por mes y cuenta.
  - Si no hay asignación única, el resultado es **Agrupación ambigua**.
  - Nunca se agrupa solo porque los importes sumen igual.
  - Cada bien se usa una sola vez.
- **Importes:** se comparan en céntimos (2 decimales). Si hay diferencia → **Diferencia de importe** (no conciliado).
- **Mes:** si difiere → **Diferencia de mes** (observado; no se vincula).

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
