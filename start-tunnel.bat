@echo off
title SI-FEST 2026 - Cloudflare Tunnel
echo ========================================================
echo   SI-FEST 2026 PHOTOBOOTH - CLOUDFLARE TUNNEL
echo ========================================================
echo.
echo Mencari binary cloudflared...

where cloudflared >nul 2>nul
if %errorlevel% equ 0 (
    set CLOUDFLARED_CMD=cloudflared
    goto START_TUNNEL
)

if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" (
    set CLOUDFLARED_CMD="C:\Program Files (x86)\cloudflared\cloudflared.exe"
    goto START_TUNNEL
)

if exist "C:\Program Files\cloudflared\cloudflared.exe" (
    set CLOUDFLARED_CMD="C:\Program Files\cloudflared\cloudflared.exe"
    goto START_TUNNEL
)

echo [ERROR] cloudflared.exe tidak ditemukan!
echo Silakan install ulang melalui: winget install Cloudflare.cloudflared
pause
exit /b 1

:START_TUNNEL
echo Menghubungkan localhost:3000 ke Cloudflare Tunnel Edge...
echo Tunggu sebentar hingga link https://xxx.trycloudflare.com muncul di layar!
echo ========================================================
echo.
%CLOUDFLARED_CMD% tunnel --url http://localhost:3000
pause
