@echo off
cd /d "%~dp0"
echo Starting the dashboard... (close this window or press Ctrl+C to stop it)
python server.py
pause
