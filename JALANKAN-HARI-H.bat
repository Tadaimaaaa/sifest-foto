@echo off
title SI-FEST 2026 PHOTOBOOTH - LAUNCHER
echo ========================================================
echo   SI-FEST 2026 PHOTOBOOTH - MENYIAPKAN SISTEM HARI H
echo ========================================================
echo.
cd /d "%~dp0"

:: Jalankan master runner Node.js
node run-hari-h.js

pause
