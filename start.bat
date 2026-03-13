@echo off
chcp 65001 >nul
cd /d "%~dp0"
:: Clear ELECTRON_RUN_AS_NODE to ensure Electron runs as app, not Node
(set ELECTRON_RUN_AS_NODE=)
node_modules\electron\dist\electron.exe .
pause
