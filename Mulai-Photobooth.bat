@echo off
title SI-FEST 2026 Photobooth Server
echo ===================================================
echo   SI-FEST 2026 PHOTOBOOTH - STARTUP SYSTEM
echo ===================================================
echo.
echo Menyalakan Backend (Camera Service) dan Frontend (Web) secara bersamaan...
echo.

:: Menjalankan backend di jendela terminal baru
start "SI-FEST Backend (Camera)" cmd /k "cd camera-service && npm run dev"

:: Menjalankan frontend di jendela terminal baru
start "SI-FEST Frontend (Web)" cmd /k "cd web && npm run dev"

echo ===================================================
echo   SEMUA SERVER SEDANG DINYALAKAN!
echo   Dua jendela terminal warna hitam telah terbuka.
echo   (Mohon jangan ditutup jendela hitam tersebut)
echo.
echo   1. Layar Kiosk di LAPTOP:
echo      http://localhost:3000/photobooth
echo.
echo   2. Layar Kiosk di IPAD / TAB (Pastikan 1 WiFi dengan laptop):
ipconfig | findstr /i "IPv4"
echo      (Ketik alamat IP di atas pada browser iPad, contoh: http://192.168.1.15:3000/photobooth)
echo.
echo   3. Panel Admin (Upload & Kelola Template Panitia):
echo      http://localhost:3000/admin   (PIN: 12345)
echo ===================================================
pause
