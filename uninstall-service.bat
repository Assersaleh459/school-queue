@echo off
echo ============================================
echo  SchoolQ - Remove Windows Service
echo ============================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Run this file as Administrator.
    pause
    exit /b 1
)

cd /d "%~dp0"

pm2 delete schoolq
pm2 save

echo SchoolQ service removed.
pause
