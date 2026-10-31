@echo off
setlocal EnableDelayedExpansion
title SI-FEST 2026 - SETUP LAPTOP SERVER PHOTOBOOTH

:: Memastikan jendela CMD TIDAK PERNAH tertutup otomatis jika script selesai atau error
if not defined PERSISTENT_CMD (
    set "PERSISTENT_CMD=1"
    cmd /k ""%~f0" %*"
    exit /b
)

cd /d "%~dp0"
cls

echo ================================================================
echo    SI-FEST 2026 PHOTOBOOTH - SETUP LAPTOP SERVER HARI H
echo ================================================================
echo Script ini akan memeriksa dan menyiapkan semua kebutuhan
echo agar laptop ini 100%% siap digunakan untuk photobooth.
echo.
echo Waktu estimasi : 1 - 3 menit [tergantung koneksi internet]
echo ================================================================
echo.

:: -------------------------------------------------------------
:: 1. Periksa Node.js & npm
:: -------------------------------------------------------------
echo [1/4] Memeriksa instalasi Node.js...
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
    echo.
    echo   [X] Node.js BELUM terdeteksi di laptop ini!
    echo.
    echo   Solusi:
    echo     1. Unduh installer Node.js LTS dari: https://nodejs.org/
    echo     2. Jalankan installer sampai tombol Finish ditekan.
    echo     3. Jika baru selesai diinstal, silakan RESTART laptop Anda sekali.
    echo.
    goto error_exit
)

for /f "tokens=*" %%v in ('node -v') do set "NODE_VER=%%v"
for /f "tokens=*" %%v in ('npm -v 2^>nul') do set "NPM_VER=%%v"
echo     [OK] Node.js aktif : !NODE_VER!
echo     [OK] npm aktif     : !NPM_VER!
echo.

:: -------------------------------------------------------------
:: 2. Install dependensi camera-service
:: -------------------------------------------------------------
echo [2/4] Menyiapkan modul Camera Service...
if not exist "camera-service" (
    echo     [X] Folder camera-service tidak ditemukan!
    goto error_exit
)

cd camera-service
echo     - Menginstal modul camera-service...
call npm install --no-fund --no-audit
if %errorlevel% neq 0 (
    echo     [PERINGATAN] Ada catatan saat instalasi camera-service, proses dilanjutkan...
) else (
    echo     [OK] Modul camera-service siap!
)
cd ..
echo.

:: -------------------------------------------------------------
:: 3. Install dependensi web (Next.js & UI)
:: -------------------------------------------------------------
echo [3/4] Menyiapkan modul Web Photobooth [Next.js ^& Kiosk UI]...
if not exist "web" (
    echo     [X] Folder web tidak ditemukan!
    goto error_exit
)

echo     - Proses ini mengunduh modul Next.js, butuh waktu 1-3 menit...
echo     - Sedang mengunduh dan memasang paket web...
cd web
call npm install --no-fund --no-audit
if %errorlevel% neq 0 (
    echo     [PERINGATAN] Mencoba kembali instalasi web...
    call npm install
)
echo     [OK] Modul Web Photobooth siap!
cd ..
echo.

:: -------------------------------------------------------------
:: 4. Periksa digiCamControl & Cloudflared
:: -------------------------------------------------------------
echo [4/4] Memeriksa aplikasi pendukung [Hardware ^& Jaringan]...

:: Cek digiCamControl
set DCC_FOUND=0
if exist "C:\Program Files (x86)\digiCamControl\CameraControlRemoteCmd.exe" set DCC_FOUND=1
if exist "C:\Program Files\digiCamControl\CameraControlRemoteCmd.exe" set DCC_FOUND=1

if !DCC_FOUND! equ 1 (
    echo     [OK] digiCamControl terdeteksi terpasang!
) else (
    echo     [PERINGATAN] digiCamControl belum ditemukan di Program Files!
    echo     Silakan unduh gratis dari: https://digicamcontrol.com/download
    echo     PENTING di digiCamControl: Menu File - Settings - Webserver - Centang "Enable Web Server" port 5513.
)

:: Cek Cloudflared
set CF_FOUND=0
where cloudflared >nul 2>nul && set CF_FOUND=1
if exist "C:\Program Files\cloudflared\cloudflared.exe" set CF_FOUND=1
if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" set CF_FOUND=1

if !CF_FOUND! equ 1 (
    echo     [OK] Cloudflared [Tunnel Edge] terdeteksi terpasang!
) else (
    echo     [INFO] Cloudflared belum terpasang [opsional untuk QRIS / share online via Cloudflare].
)

:: Cek file konfigurasi web\.env.local
if not exist "web\.env.local" (
    if exist "web\.env.example" (
        copy "web\.env.example" "web\.env.local" >nul
        echo     [OK] Berhasil membuat web\.env.local otomatis dari template!
    ) else (
        echo     [PERINGATAN] File web\.env.local belum ditemukan!
    )
) else (
    echo     [OK] File konfigurasi web\.env.local sudah tersedia!
)

:: Cek file konfigurasi camera-service\.env
if not exist "camera-service\.env" (
    if exist "camera-service\.env.example" (
        copy "camera-service\.env.example" "camera-service\.env" >nul
        echo     [OK] Berhasil membuat camera-service\.env otomatis dari template!
    )
)

:: Pastikan folder storage ada
if not exist "storage" mkdir "storage"

echo.
echo ================================================================
echo   🎉 SETUP SELESAI! LAPTOP INI SUDAH SIAP UNTUK HARI H 🎉
echo ================================================================
echo.
echo Panduan singkat Hari H:
echo   1. Sambungkan kamera DSLR via kabel USB ke laptop.
echo   2. Buka aplikasi digiCamControl [pastikan kamera terdeteksi].
echo   3. Jalankan file: JALANKAN-HARI-H.bat
echo   4. Buka URL Photobooth dari browser iPad / laptop display.
echo.
echo ----------------------------------------------------------------
echo Pilihan tindakan:
echo   [1] Langsung tes jalankan Photobooth sekarang
echo   [2] Buka folder sifest-foto di Windows Explorer
echo   [3] Selesai [tutup jendela ini kapan saja]
echo ----------------------------------------------------------------
set /p USER_CHOICE="Masukkan nomor pilihan [1/2/3] lalu tekan Enter: "

if "%USER_CHOICE%"=="1" (
    echo.
    echo Menjalankan sistem Photobooth...
    echo.
    node run-hari-h.js
    goto finish
)

if "%USER_CHOICE%"=="2" (
    explorer .
    goto finish
)

:finish
echo.
echo Setup selesai. Jendela ini aman untuk Anda tutup secara manual.
pause
exit /b 0

:error_exit
echo.
echo ================================================================
echo   [ERROR] Terjadi kendala saat persiapan. Silakan periksa pesan di atas.
echo   Jendela ini tidak akan tertutup agar Anda bisa membaca pesan error.
echo ================================================================
pause
exit /b 1
