#!/usr/bin/env bash
# Pruebas de extremo a extremo de la base central (requiere Node 18+ y Playwright con Chromium).
# Levanta las funciones reales (netlify/functions) con un Netlify Blobs simulado en memoria y el index.html del sitio.
set -e; cd "$(dirname "$0")/.."; node tests/verificar-funciones.mjs; T=$(mktemp -d); mkdir -p "$T/node_modules"; cp -r netlify "$T/"; cp -r tests/mock-blobs/@netlify "$T/node_modules/"
cp tests/servidor-prueba.mjs "$T/"; HTML="$PWD/public/index.html"; (cd "$T" && exec env FN="$T" node servidor-prueba.mjs "$HTML") & PID=$!; sleep 2
node tests/e2e-sincronizacion.cjs; node tests/e2e-inventariador.cjs; node tests/e2e-estados.cjs; curl -s localhost:8810/__seed >/dev/null; node tests/e2e-migracion.cjs; node tests/e2e-guardar.cjs; node tests/e2e-migracion-local.cjs
kill $PID
