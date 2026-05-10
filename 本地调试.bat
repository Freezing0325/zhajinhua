@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo.
echo  ================================
echo    炸金花 - 本地调试模式
echo  ================================
echo.

:: 清理端口 3000 上的残留进程
powershell -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }" >nul 2>&1

:: 检查 Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo  [错误] 未找到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

echo  无需 cloudflared，仅本地运行
echo  打开浏览器访问 http://localhost:3000
echo  用多个标签页即可模拟多人对战
echo.
echo  按 Ctrl+C 关闭服务器
echo.

node "%~dp0start.js" --local

echo.
echo  服务器已关闭。
pause
