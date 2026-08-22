@echo off
REM Build and start the RA3 Community Bot.
cd /d "%~dp0"
call npm run build
if errorlevel 1 (
  echo Build failed — see errors above.
  pause
  exit /b 1
)
call npm start
