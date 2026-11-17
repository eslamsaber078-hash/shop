@echo off
title D STORE - Local Server
cd /d "%~dp0"
echo.
echo   D STORE
echo   ---------
echo   Store: http://localhost:8140/index.html
echo   Admin: http://localhost:8140/admin.html
echo.
echo   Close this window to stop the server.
echo.
start "" http://localhost:8140/admin.html
node server.js
pause
