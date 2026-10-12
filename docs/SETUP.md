# SETUP — Environment & Installation Guide

> **Phase:** 0 Revision  
> **Status:** Draft

---

## 1. PREREQUISITES (Laptop / Server)

### Hardware Requirements
- Laptop/PC running Windows, macOS, or Linux.
- Available USB ports (1 for DSLR, 1 for Printer).
- Wi-Fi Router (can be offline, but needed to connect Laptop + iPad).

### Software Requirements
- **Node.js**: v18.x or v20.x (LTS recommended)
- **npm** or **pnpm**
- **Git**
- **FFmpeg**: Required for MP4 generation.

#### Installing FFmpeg
- **Windows**: Download from [gyan.dev](https://www.gyan.dev/ffmpeg/builds/), extract, and add `bin/` to System PATH.
- **macOS**: `brew install ffmpeg`
- **Linux (Ubuntu)**: `sudo apt update && sudo apt install -y ffmpeg`

Verify installation:
```bash
ffmpeg -version
```

---

## 2. INSTALLATION

```bash
git clone <repository_url> sifest-foto
cd sifest-foto

# 1. Install Web Server dependencies
cd web
npm install

# 2. Install Camera Service dependencies
cd ../camera-service
npm install
```

---

## 3. CONFIGURATION (.env)

Create `.env.local` in the `web/` directory:

```env
# web/.env.local

# Network (Update to your laptop's Wi-Fi IP address)
NEXT_PUBLIC_SERVER_URL=http://192.168.1.10:3000

# Storage
STORAGE_PATH=../storage

# Supabase (Optional for local testing, required for online QR)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Print
PRINT_ADAPTER=mock
PRINTER_NAME=Your_Printer_Name_Here

# Camera
CAMERA_SERVICE_URL=http://localhost:3001
```

Create `.env` in the `camera-service/` directory:

```env
# camera-service/.env

PORT=3001
CAMERA_ADAPTER=mock
# Once Real DSLR is ready in Phase 3:
# CAMERA_ADAPTER=digicamcontrol
```

---

## 4. RUNNING THE SYSTEM

During development (Phase 1+):

**Terminal 1 (Camera Service)**
```bash
cd camera-service
npm run dev
```

**Terminal 2 (Web Server)**
```bash
cd web
npm run dev
```

The system is now running:
- Kiosk UI: `http://localhost:3000` (Open on iPad)
- Admin UI: `http://localhost:3000/admin`
- Camera API: `http://localhost:3001` (Internal)

---

## 5. PRODUCTION DEPLOYMENT (Event Day)

For the actual event, it is recommended to build the Next.js app to improve performance and compile TypeScript.

```bash
cd web
npm run build
npm run start
```

*Note: Camera Service can run via `ts-node` or be compiled to JS.*
