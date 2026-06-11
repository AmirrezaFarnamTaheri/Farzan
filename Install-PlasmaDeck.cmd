@echo off
setlocal

REM PlasmaDeck installer launcher.

set "INSTALLER=%~dp0far\desktop-dist\PlasmaDeck-Native\PlasmaDeck_1.1.2_x64-setup.exe"

if exist "%INSTALLER%" (
  start "" "%INSTALLER%"
  exit /b 0
)

echo [PlasmaDeck] Installer was not found at:
echo [PlasmaDeck]   "%INSTALLER%"
echo [PlasmaDeck] Build it with: cd "%~dp0far" ^&^& npm run native:package
pause
exit /b 1
