@echo off
title SI-FEST 2026 PHOTOBOOTH - LAUNCHER
echo ========================================================
echo   SI-FEST 2026 PHOTOBOOTH - MENYIAPKAN SISTEM HARI H
echo ========================================================
echo.
cd /d "%~dp0"

:: Cek direktori instalasi standar Node.js di Windows jika PATH belum diperbarui
where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    ) else if exist "C:\Program Files (x86)\nodejs\node.exe" (
        set "PATH=C:\Program Files (x86)\nodejs;%PATH%"
    ) else if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
    )
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js belum terdeteksi di sistem Windows laptop ini!
    echo.
    echo Jika Anda baru saja menginstal Node.js:
    echo   Silakan RESTART laptop Anda sekali agar Windows menyegarkan PATH sistem.
    echo.
    pause
    exit /b 1
)

:: Jalankan master runner Node.js
node run-hari-h.js

echo.
echo ========================================================
echo   Sistem photobooth telah ditutup.
echo ========================================================
pause
