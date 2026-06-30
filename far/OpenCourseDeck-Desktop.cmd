@echo off
setlocal

REM OpenCourseDeck desktop-style launcher.
REM Starts OpenCourseDeck in a dedicated app window through desktop/app-window.cjs.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [OpenCourseDeck] ERROR: Node.js is not installed or not on PATH.
  pause
  exit /b 1
)

call npm run desktop:app-window
if errorlevel 1 (
  echo.
  echo [OpenCourseDeck] Desktop app-window launch failed.
  pause
  exit /b 1
)
