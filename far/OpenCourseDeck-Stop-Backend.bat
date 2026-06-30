@echo off
setlocal EnableDelayedExpansion

REM Interactive stop for the OpenCourseDeck dev server (port 5173).
REM Browsers cannot shut down Node — use this (or close the backend CMD window).

cd /d "%~dp0"

echo.
echo  ============================================================
echo   OpenCourseDeck — stop local backend
echo  ============================================================
echo   Port: 5173 ^(see scripts\dev-server.cjs / PORT env^)
echo   Your app data lives in the browser ^(IndexedDB / storage^), not in Node.
echo.

choice /C YN /M "Stop the backend server now (free port 5173)"
if errorlevel 2 (
  echo [OpenCourseDeck] Cancelled — backend was not stopped.
  goto :end
)

call "%~dp0Stop-OpenCourseDeck.cmd"
if errorlevel 1 (
  echo [OpenCourseDeck] Stop script reported an issue.
) else (
  echo [OpenCourseDeck] Backend stop completed.
)

echo.
choice /C YN /M "Did you finish saving your work in the browser? (Notes autosave; you can say Y to close this window.)"
if errorlevel 2 (
  echo [OpenCourseDeck] Remember: save or wait for autosave before closing important tabs.
)

:end
echo.
pause
exit /b 0
