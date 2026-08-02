@echo off
REM  Pagina de codigos UTF-8: sin esto los acentos salen ilegibles en el
REM  registro, porque node escribe UTF-8 y la consola espera cp850.
chcp 65001 >nul
REM ===========================================================================
REM  Lanzador del backup para el Programador de tareas de Windows.
REM
REM  Existe este .cmd en vez de llamar a node directamente porque la tarea
REM  necesita tres cosas que el programador no da por sí solo: situarse en la
REM  carpeta del proyecto (el script lee .env.local con ruta relativa), dejar
REM  registro de lo ocurrido, y devolver un codigo de salida que el programador
REM  pueda mostrar como error.
REM
REM  La clave sale de BACKUP_CLAVE en .env.local; aqui no se escribe ninguna.
REM
REM  Registro:  backups\backup.log
REM ===========================================================================

cd /d "%~dp0.."

set "LOG=backups\backup.log"
if not exist "backups" mkdir "backups"

echo. >> "%LOG%"
echo ======================================================== >> "%LOG%"
echo Inicio: %date% %time% >> "%LOG%"

node scripts\backup-datos.mjs >> "%LOG%" 2>&1
set CODIGO=%ERRORLEVEL%

if %CODIGO% EQU 0 (
  echo Fin OK: %date% %time% >> "%LOG%"
) else (
  echo *** FALLO con codigo %CODIGO%: %date% %time% >> "%LOG%"
)

REM El programador muestra este codigo en la columna "Resultado de la ultima
REM ejecucion", asi que un fallo se ve sin abrir el registro.
exit /b %CODIGO%
