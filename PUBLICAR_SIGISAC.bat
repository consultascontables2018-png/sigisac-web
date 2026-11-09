@echo off
chcp 65001 >nul
title Publicar SIGISAC ERP en Netlify (segisacerp) con base de datos
cd /d "%~dp0"
echo.
echo  ==== SIGISAC ERP PROFESIONAL - Publicar en Netlify (segisacerp) ====
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  Falta Node.js. Se abrira https://nodejs.org : instale la version LTS y vuelva a ejecutar este archivo.
  start "" https://nodejs.org
  pause
  exit /b 1
)
echo  [1/3] Instalando componentes de la base de datos...
call npm install --no-audit --no-fund
if errorlevel 1 goto error
echo.
echo  [2/3] Inicie sesion en Netlify en la ventana del navegador que se abrira y pulse Authorize...
call npx --yes netlify-cli login
if errorlevel 1 goto error
echo.
echo  [3/3] Publicando SIGISAC con su base de datos en segisacerp...
call npx --yes netlify-cli deploy --prod --site segisacerp --dir public --functions netlify/functions
if errorlevel 1 goto error
echo.
echo  LISTO. Se abrira la comprobacion: debe decir {"sigisac":1,"ok":true}
start "" "https://segisacerp.netlify.app/api/db?c=_ping"
pause
exit /b 0
:error
echo.
echo  Ocurrio un error. Tome una captura de esta ventana y enviela por el chat de SIGISAC.
pause
exit /b 1
