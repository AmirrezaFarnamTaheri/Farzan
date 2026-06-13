@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "PID_FILE=%~dp0plasmadeck-server.pid"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$pidFile = '%PID_FILE%';" ^
  "$ids = @();" ^
  "if (Test-Path $pidFile) { $ids += Get-Content $pidFile | Where-Object { $_ -match '^\d+$' } }" ^
  "$ids += Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'dev-server\.cjs' } | Select-Object -ExpandProperty ProcessId;" ^
  "$ids | Sort-Object -Unique | ForEach-Object { Stop-Process -Id $_ -ErrorAction SilentlyContinue };" ^
  "Remove-Item $pidFile -ErrorAction SilentlyContinue"

exit /b 0
