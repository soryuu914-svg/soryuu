@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "desktop\node_modules\electron\dist\electron.exe" (
  echo 缺少桌面运行文件，请先安装 desktop 目录的依赖。
  pause
  exit /b 1
)
if not exist "desktop\protected\dist\index.html" (
  echo 缺少桌面界面，请先执行桌面保护构建。
  pause
  exit /b 1
)
set ELECTRON_RUN_AS_NODE=
start "写作台" "desktop\node_modules\electron\dist\electron.exe" "desktop\protected"
