@echo off
echo ============================================
echo  SchoolQ - Install as Windows Service
echo ============================================
echo.

:: Check for admin privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Run this file as Administrator.
    echo Right-click ^> "Run as administrator"
    pause
    exit /b 1
)

:: Check Node is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed.
    echo Download from https://nodejs.org
    pause
    exit /b 1
)

:: Change to script directory
cd /d "%~dp0"

:: Install PM2 globally if not already installed
where pm2 >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing PM2...
    npm install -g pm2
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install PM2.
        pause
        exit /b 1
    )
)

:: Install dependencies if needed
if not exist "node_modules" (
    echo Installing dependencies...
    npm install --omit=dev
)

:: Stop existing instance if running
pm2 delete schoolq >nul 2>&1

:: Start the server with PM2
echo Starting SchoolQ server...
pm2 start src/backend/server.js --name schoolq --restart-delay 3000

:: Save PM2 process list
pm2 save

:: Configure PM2 to start on Windows boot (creates Task Scheduler entry)
pm2 startup

echo.
echo ============================================
echo  Done! SchoolQ server is now running.
echo  It will start automatically on reboot.
echo.
echo  Commands:
echo    pm2 status          - check if running
echo    pm2 logs schoolq    - view logs
echo    pm2 restart schoolq - restart server
echo    pm2 stop schoolq    - stop server
echo ============================================
echo.
pause
