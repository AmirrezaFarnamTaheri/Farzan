@echo off
REM One-click launcher: opens the PlasmaDeck project in far\ and starts the local server.
if exist "%~dp0far\desktop-dist\PlasmaDeck-Native\PlasmaDeck.exe" (
  start "" "%~dp0far\desktop-dist\PlasmaDeck-Native\PlasmaDeck.exe"
  exit /b 0
)
cd /d "%~dp0far" || exit /b 1
call "%~dp0far\PlasmaDeck-OneClick.bat"
exit /b %errorlevel%
