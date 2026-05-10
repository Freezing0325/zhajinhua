@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo.
echo  ================================
echo    炸金花 - 正在启动服务器...
echo  ================================
echo.

:: 清理端口 3000 上的残留进程
powershell -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }" >nul 2>&1

:: 检查 Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo  [错误] 未找到 Node.js，请先安装 Node.js
    echo        下载地址：https://nodejs.org
    pause
    exit /b 1
)

echo  公网隧道模式：
echo    [1] Cloudflare Tunnel ^(默认^)
echo    [2] natapp ^(国内更稳定^)
echo    [3] 仅本地调试
echo.
set /p CHOICE="  请输入选项 (1/2/3，默认 1): "

if "%CHOICE%"=="3" (
    node "%~dp0start.js" --local
    goto end
)

if "%CHOICE%"=="2" (
    node "%~dp0start.js" --tunnel natapp
    goto end
)

:: 默认：Cloudflare
node "%~dp0start.js"

:end
echo.
echo  服务器已关闭。
pause
