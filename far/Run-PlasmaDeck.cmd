@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "PID_FILE=%~dp0plasmadeck-server.pid"
set "DEBUG_LOG=%~dp0debug.log"

for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format o"') do set "STAMP=%%t"
>> "%DEBUG_LOG%" echo {"location":"Run-PlasmaDeck.cmd","message":"starting","timestamp":"%STAMP%"}

if not exist "node_modules\esbuild\package.json" (
  echo [PlasmaDeck] Dependencies are missing. Run npm install first.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p = Start-Process node -ArgumentList 'scripts\dev-server.cjs' -PassThru -WindowStyle Hidden; $p.Id | Set-Content -Encoding ascii '%PID_FILE%'"

start "" "http://localhost:5173/"
exit /b 0
