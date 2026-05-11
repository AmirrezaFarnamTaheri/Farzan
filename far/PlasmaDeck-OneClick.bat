@echo off
setlocal EnableDelayedExpansion

REM PlasmaDeck — one-click launcher (Windows)
REM - Stops any existing dev server on port 5173
REM - Ensures deps, vendor, build, service worker
REM - Starts the backend in a visible window (close that window to stop the server)
REM - Opens the app in your default browser

cd /d "%~dp0"

set "DEBUG_LOG=%~dp0debug.log"
set "RUN_ID=launcher-oneclick"
set "SERVER_LOG=%~dp0server-%RANDOM%.log"

call :log "PlasmaDeck-OneClick.bat:boot" "Launcher starting" "{}"

where node >nul 2>nul
if errorlevel 1 (
  echo [PlasmaDeck] ERROR: Node.js is not installed or not on PATH.
  echo Install from https://nodejs.org/ then re-run this file.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [PlasmaDeck] ERROR: npm is not available on PATH.
  pause
  exit /b 1
)

echo [PlasmaDeck] Stopping any previous server on port 5173...
call "%~dp0Stop-PlasmaDeck.cmd" >nul 2>nul

echo [PlasmaDeck] Checking dependencies...
if not exist "node_modules\" (
  echo [PlasmaDeck] Installing npm dependencies ^(first run only^)...
  call npm install
  if errorlevel 1 goto :fail
)

echo [PlasmaDeck] Preparing assets ^(vendor / build / service worker^)...
call npm run first-run
if errorlevel 1 goto :fail

echo [PlasmaDeck] Starting backend in a new window ^(http://localhost:5173/^) ...
call :log "PlasmaDeck-OneClick.bat:server" "Starting visible backend process" "{\"port\":5173}"

REM Use start /D so the child process runs with correct working directory.
start "PlasmaDeck Backend — port 5173" /D "%~dp0" cmd /k "node scripts\dev-server.cjs"

set /a tries=0
:waitLoop
set /a tries+=1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
  call :log "PlasmaDeck-OneClick.bat:server" "Listening" "{\"pid\":%%p}"
  echo.
  echo [PlasmaDeck] Server is up. Opening browser...
  echo [PlasmaDeck] — Close the titled "PlasmaDeck Backend" window to stop the server.
  echo [PlasmaDeck] — Or run: PlasmaDeck-Stop-Backend.bat ^(choice to stop / save reminder^).
  echo.
  start "" "http://localhost:5173/"
  call :log "PlasmaDeck-OneClick.bat:done" "Browser launched" "{}"
  exit /b 0
)
if %tries% GEQ 45 (
  echo [PlasmaDeck] ERROR: Server did not open port 5173 in time.
  echo If a firewall blocked Node, allow it or check for errors in the backend window.
  pause
  exit /b 1
)
timeout /t 1 >nul
goto :waitLoop

:fail
echo.
echo [PlasmaDeck] ERROR: A step failed. See messages above.
pause
exit /b 1

:log
set "LOC=%~1"
set "MSG=%~2"
set "DATA=%~3"
>> "%DEBUG_LOG%" echo {"runId":"%RUN_ID%","location":"%LOC%","message":"%MSG%","data":%DATA%,"timestamp":%RANDOM%}
exit /b 0
