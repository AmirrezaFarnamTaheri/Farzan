@echo off
setlocal

REM OpenCourseDeck installer launcher.

set "INSTALLER=%~dp0far\desktop-dist\OpenCourseDeck-Native\OpenCourseDeck_1.1.2_x64-setup.exe"

if exist "%INSTALLER%" (
  start "" "%INSTALLER%"
  exit /b 0
)

echo [OpenCourseDeck] Installer was not found at:
echo [OpenCourseDeck]   "%INSTALLER%"
echo [OpenCourseDeck] Build it with: cd "%~dp0far" ^&^& npm run native:package
pause
exit /b 1
