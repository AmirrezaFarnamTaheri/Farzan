@echo off
REM One-click launcher: opens the PlasmaDeck project in far\ and starts the local server.
cd /d "%~dp0far" || exit /b 1
call "%~dp0far\PlasmaDeck-OneClick.bat"
exit /b %errorlevel%
