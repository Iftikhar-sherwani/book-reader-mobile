@echo off
title Book Reader Desktop
cd /d "%~dp0"
python main.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [Book Reader] App exited with an error. Press any key to exit...
    pause >nul
)
