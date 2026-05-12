@echo off
cd /d "%~dp0"
chcp 65001 >nul 2>&1
where node >nul 2>&1 || (echo Node.js not found: https://nodejs.org && pause && exit /b 1)
if not exist "%~dp0node_modules" (echo Installing dependencies... && call npm install)
node "%~dp0start.js"
pause
