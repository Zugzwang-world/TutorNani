@echo off
title Nani's brain  (close this window to stop Nani)
cd /d "%~dp0brain"
echo ==================================================
echo   Nani's brain is starting.
echo   It finds the toy on the Wi-Fi by itself, answers
echo   with the website's Nani and plays website speech.
echo   Then just press the switch on the toy.
echo   Close this window to stop.
echo ==================================================
:loop
python nani_brain.py %*
echo.
echo Brain stopped. Restarting in 3 seconds... (close this window to quit)
timeout /t 3 /nobreak >nul
goto loop
