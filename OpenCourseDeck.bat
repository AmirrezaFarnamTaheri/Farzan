@echo off
REM One-click launcher: opens the OpenCourseDeck project in far\ and starts the local server.
if exist "%~dp0far\desktop-dist\OpenCourseDeck-Native\OpenCourseDeck.exe" (
  start "" "%~dp0far\desktop-dist\OpenCourseDeck-Native\OpenCourseDeck.exe"
  exit /b 0
)
cd /d "%~dp0far" || exit /b 1
call "%~dp0far\OpenCourseDeck-OneClick.bat"
exit /b %errorlevel%
