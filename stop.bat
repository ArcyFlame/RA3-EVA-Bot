@echo off
REM Ask this installation's managed host to stop gracefully.
cd /d "%~dp0"
call npm stop
