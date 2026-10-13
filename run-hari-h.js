const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

console.clear();
console.log('================================================================');
console.log('       📸 SI-FEST 2026 PHOTOBOOTH SYSTEM - LAUNCHER HARI H      ');
console.log('================================================================');
console.log('');

const rootDir = __dirname;
const storageDir = path.join(rootDir, 'storage');
const tunnelFile = path.join(storageDir, 'tunnel-url.txt');
const envLocalPath = path.join(rootDir, 'web', '.env.local');

if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

// Find cloudflared binary
function getCloudflaredPath() {
  const possiblePaths = [
    'cloudflared',
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
  ];

  for (const p of possiblePaths) {
    if (p === 'cloudflared') {
      try {
        execSync('where cloudflared', { stdio: 'ignore' });
        return 'cloudflared';
      } catch (e) {}
    } else if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

// Check if digiCamControl is running
function checkDigiCamControl() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:5513/', { timeout: 2000 }, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  console.log('🔍 [1/4] Memeriksa koneksi digiCamControl (Kamera DSLR)...');
  const dccRunning = await checkDigiCamControl();
  if (dccRunning) {
    console.log('   ✅ digiCamControl aktif & terhubung di port 5513.');
  } else {
    console.log('   ⚠️  PERINGATAN: digiCamControl belum terdeteksi aktif di port 5513!');
    console.log('   👉 Pastikan buka aplikasi digiCamControl dan nyalakan kamera DSLR.');
    console.log('   (Sistem tetap akan menyalakan server...)');
  }
  console.log('');

  // 1. Start Camera Service (Port 3001)
  console.log('🚀 [2/4] Menyalakan Camera Service (Port 3001)...');
  const cameraService = spawn('npm.cmd', ['run', 'dev'], {
    cwd: path.join(rootDir, 'camera-service'),
    stdio: 'inherit',
    shell: true,
  });

  // 2. Start Web Server (Port 3000)
  console.log('🚀 [3/4] Menyalakan Web Kiosk Next.js (Port 3000)...');
  const webServer = spawn('npm.cmd', ['run', 'dev'], {
    cwd: path.join(rootDir, 'web'),
    stdio: 'inherit',
    shell: true,
  });

  // 3. Start Cloudflare Tunnel
  console.log('🌐 [4/4] Menghubungkan ke Cloudflare Tunnel Edge (Akses Publik & QRIS)...');
  const cloudflaredBin = getCloudflaredPath();
  let tunnelProcess = null;

  if (cloudflaredBin) {
    tunnelProcess = spawn(cloudflaredBin, ['tunnel', '--url', 'http://localhost:3000'], {
      shell: false,
    });

    let tunnelFound = false;

    const handleOutput = (data) => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !tunnelFound) {
        tunnelFound = true;
        const liveTunnelUrl = match[0];
        
        // Save to storage/tunnel-url.txt
        try {
          fs.writeFileSync(tunnelFile, liveTunnelUrl, 'utf-8');
        } catch (e) {}

        // Update web/.env.local
        try {
          if (fs.existsSync(envLocalPath)) {
            let envContent = fs.readFileSync(envLocalPath, 'utf-8');
            if (envContent.includes('NEXT_PUBLIC_PHOTO_BASE_URL=')) {
              envContent = envContent.replace(
                /NEXT_PUBLIC_PHOTO_BASE_URL=.*/,
                `NEXT_PUBLIC_PHOTO_BASE_URL=${liveTunnelUrl}`
              );
            } else {
              envContent += `\nNEXT_PUBLIC_PHOTO_BASE_URL=${liveTunnelUrl}\n`;
            }
            fs.writeFileSync(envLocalPath, envContent, 'utf-8');
          }
        } catch (e) {}

        console.log('');
        console.log('================================================================');
        console.log('  🎉 SEMUA SISTEM PHOTOBOOTH BERHASIL AKTIF & SIAP DIGUNAKAN!   ');
        console.log('================================================================');
        console.log(`  🖥️  Layar Photobooth Kiosk : http://localhost:3000/photobooth`);
        console.log(`  🌐  Link Publik / HP Tamu  : ${liveTunnelUrl}`);
        console.log(`  💳  Payment Gateway        : DOKU (Otomatis Webhook & QRIS)`);
        console.log(`  ⚙️  Panel Admin Template   : http://localhost:3000/admin (PIN: 12345)`);
        console.log('================================================================');
        console.log('  Membuka browser ke layar Photobooth...');
        console.log('  (Tekan Ctrl + C di terminal ini untuk mematikan semua server)');
        console.log('');

        // Open browser
        try {
          execSync('start http://localhost:3000/photobooth', { stdio: 'ignore', shell: true });
        } catch (e) {}
      }
    };

    tunnelProcess.stdout.on('data', handleOutput);
    tunnelProcess.stderr.on('data', handleOutput);

    tunnelProcess.on('exit', (code) => {
      console.log(`[Tunnel] Process exited with code ${code}`);
    });
  } else {
    console.log('⚠️  cloudflared.exe tidak ditemukan. Jalankan tunnel manual dengan start-tunnel.bat');
  }

  // Graceful shutdown on Ctrl+C
  const cleanup = () => {
    console.log('\n🛑 Mematikan semua server photobooth...');
    try {
      if (cameraService) cameraService.kill();
      if (webServer) webServer.kill();
      if (tunnelProcess) tunnelProcess.kill();
    } catch (e) {}
    process.exit();
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch(console.error);
