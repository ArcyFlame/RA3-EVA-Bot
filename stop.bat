@echo off
REM Stop the RA3 Community Bot (kills only the node process running dist/index.js).
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*dist*index.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Write-Host 'Bot stopped.'"
