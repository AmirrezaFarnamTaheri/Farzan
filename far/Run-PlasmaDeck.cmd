@echo off
setlocal enabledelayedexpansion

REM PlasmaDeck one-click launcher for Windows
REM - Installs dependencies if missing
REM - Vendors local assets + builds bundle + generates service worker
REM - Starts local server and opens browser

cd /d "%~dp0"

set "DEBUG_LOG=%~dp0debug.log"
set "RUN_ID=launcher"
REM Use a unique log file each run to avoid Windows file locking issues.
set "SERVER_LOG=%~dp0server-%RANDOM%.log"

REM Minimal NDJSON logger (no secrets)
call :log "Run-PlasmaDeck.cmd:boot" "Launcher starting" "{}"

where node >nul 2>nul
if errorlevel 1 (
  call :log "Run-PlasmaDeck.cmd:check" "Node missing" "{}"
  echo [PlasmaDeck] ERROR: Node.js is not installed or not on PATH.
  echo Install Node.js from https://nodejs.org/ then re-run this file.
  pause
  exit /b 1
)
call :log "Run-PlasmaDeck.cmd:check" "Node OK" "{}"

where npm >nul 2>nul
if errorlevel 1 (
  call :log "Run-PlasmaDeck.cmd:check" "npm missing" "{}"
  echo [PlasmaDeck] ERROR: npm is not available on PATH.
  echo Reinstall Node.js ^(includes npm^) then re-run this file.
  pause
  exit /b 1
)
call :log "Run-PlasmaDeck.cmd:check" "npm OK" "{}"

echo [PlasmaDeck] Checking dependencies...
if not exist "node_modules\" (
  call :log "Run-PlasmaDeck.cmd:deps" "node_modules missing, installing" "{}"
  echo [PlasmaDeck] Installing npm dependencies ^(first run only^)...
  call npm install
  if errorlevel 1 goto :fail
)
call :log "Run-PlasmaDeck.cmd:deps" "Dependencies OK" "{}"

call :log "Run-PlasmaDeck.cmd:prep" "Running first-run" "{}"
echo [PlasmaDeck] Preparing assets (vendor/build/sw)...
call npm run first-run
if errorlevel 1 goto :fail
call :log "Run-PlasmaDeck.cmd:prep" "first-run OK" "{}"

echo [PlasmaDeck] Starting server at http://localhost:5173/ ...
call :log "Run-PlasmaDeck.cmd:server" "Ensuring port is free" "{}"
call "%~dp0Stop-PlasmaDeck.cmd" >nul 2>nul
call :log "Run-PlasmaDeck.cmd:server" "Launching dev server" "{\"cmd\":\"node scripts\\\\dev-server.cjs\"}"

REM Start the server in the background and capture logs
call :log "Run-PlasmaDeck.cmd:server" "Server log path" "{\"path\":\"%SERVER_LOG%\"}"
REM Use %ComSpec% to avoid nested quote issues on Windows.
REM Call node directly to ensure we run the intended server implementation.
start "" /b "%ComSpec%" /c node scripts\dev-server.cjs 1>"%SERVER_LOG%" 2>&1
if errorlevel 1 goto :fail
call :log "Run-PlasmaDeck.cmd:server" "dev server spawned" "{}"

REM Wait until port 5173 is actually listening, then open browser
set /a tries=0
:waitLoop
set /a tries+=1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
  call :log "Run-PlasmaDeck.cmd:server" "Server is listening" "{\"pid\":%%p}"
  start "" "http://localhost:5173/"
  goto :ok
)
if %tries% GEQ 40 (
  call :log "Run-PlasmaDeck.cmd:server" "Server did not start listening in time" "{}"
  echo [PlasmaDeck] ERROR: Server did not start on port 5173.
  echo See server log: "%SERVER_LOG%"
  pause
  exit /b 1
)
timeout /t 1 >nul
goto :waitLoop

:ok
call :log "Run-PlasmaDeck.cmd:done" "Launcher completed" "{}"
echo [PlasmaDeck] Running. Use Stop-PlasmaDeck.cmd to stop.
exit /b 0

:fail
call :log "Run-PlasmaDeck.cmd:fail" "Launcher failed" "{\"errorlevel\":%errorlevel%}"
echo.
echo [PlasmaDeck] ERROR: A step failed. See messages above.
pause
exit /b 1

:log
REM args: location message dataJson
set "LOC=%~1"
set "MSG=%~2"
set "DATA=%~3"
>> "%DEBUG_LOG%" echo {"runId":"%RUN_ID%","location":"%LOC%","message":"%MSG%","data":%DATA%,"timestamp":%RANDOM%}
exit /b 0

