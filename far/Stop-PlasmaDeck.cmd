@echo off
setlocal EnableDelayedExpansion

REM Attempts to stop the server started by Run-PlasmaDeck.cmd
REM This kills the process listening on port 5173.

set "PIDS="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
  echo [PlasmaDeck] Found PID %%p on port 5173
  echo !PIDS! | findstr /c:" %%p " >nul 2>nul || set "PIDS=!PIDS! %%p "
)

for %%p in (!PIDS!) do (
  echo [PlasmaDeck] Stopping process PID %%p on port 5173...
  taskkill /PID %%p /F >nul 2>nul
)

echo [PlasmaDeck] Done.
exit /b 0

