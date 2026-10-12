# Camera Service

This is the standalone DSLR controller for the SI-FEST 2026 Photobooth system.

## Tujuan (Purpose)
Service ini HANYA bertugas berkomunikasi dengan kamera. Tidak menangani UI, session bisnis, Supabase, printing, atau photo processing final. Web server akan berkomunikasi dengan service ini melalui HTTP.

## Requirements
- Node.js 18+
- npm atau pnpm

## Installation
```bash
npm install
```

## Environment Variables
Copy `.env.example` to `.env`:
```env
CAMERA_SERVICE_HOST=127.0.0.1
CAMERA_SERVICE_PORT=3001
CAMERA_ADAPTER=mock
STORAGE_PATH=../storage
```

## Cara Menjalankan (Running the Service)
Untuk development (Phase 1):
```bash
npm run dev
```

## Endpoints

- `GET /health` : Cek apakah service berjalan.
- `GET /status` : Cek status kamera saat ini (`disconnected`, `connecting`, `ready`, `capturing`, `error`).
- `POST /connect` : Menghubungkan kamera.
- `POST /disconnect` : Memutuskan koneksi kamera.
- `POST /capture` : Mengambil foto.
  - Body: `{ "sessionId": "SIFEST-TEST-0001", "photoIndex": 1 }`
  - Constraints: `photoIndex` harus 1, 2, atau 3. `sessionId` tidak boleh kosong.

## Struktur Folder
- `src/adapters/` : Implementasi adapter kamera (MockCameraAdapter, RealAdapter).
- `src/routes/` : Endpoint HTTP Express.
- `src/types/` : Interface dan Type TypeScript.
- `src/camera-manager.ts` : Layer yang mengelola adapter dan koneksi.
- `src/server.ts` : Entry point untuk HTTP Server dan shutdown handler.

## MockCameraAdapter
Saat ini, kamera asli belum diimplementasikan. `MockCameraAdapter` mensimulasikan kamera menggunakan library `sharp` untuk membuat gambar JPEG dengan label session ID dan timestamp. File akan disimpan di `STORAGE_PATH/captures/<SESSION_ID>/`.

## Menambahkan DSLR Asli Nantinya (Real Adapter Phase 3)
1. Buat class baru di `src/adapters/` (misalnya `DigiCamControlAdapter.ts`) yang mengimplementasikan `CameraAdapter`.
2. Pada `src/camera-manager.ts`, baca env `CAMERA_ADAPTER` dan instantiate adapter baru jika nilainya sesuai (misalnya `'digicamcontrol'`).
3. Adapter asli harus menggunakan utilitas eksternal (CLI atau SDK) untuk memicu capture dan memindahkan foto ke folder lokal.
