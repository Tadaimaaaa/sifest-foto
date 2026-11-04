const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');

// Alokasikan batas memori V8 Heap hingga 4096 MB (4 GB) agar proses kompilasi Next.js tidak crash OOM (Out of Memory)
process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} --max-old-space-size=4096`.trim();

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

// Free up occupied port if any stale process exists
function freePort(port) {
  try {
    const stdout = execSync(`netstat -ano | findstr :${port}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
    const lines = stdout.split('\n');
    for (const line of lines) {
      if (line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && parseInt(pid) > 0 && parseInt(pid) !== process.pid) {
          try {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
            console.log(`   🧹 Membersihkan proses lama yang menempel di port ${port} (PID: ${pid})`);
          } catch (e) {}
        }
      }
    }
  } catch (e) {}
}

// Find cloudflared binary
function getCloudflaredPath() {
  const possiblePaths = [
    path.join(__dirname, 'cloudflared.exe'),
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

// Find local IPv4 address prioritizing physical Wi-Fi over virtual adapters
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();
    // Skip virtual adapters (VirtualBox, VMware, WSL, vEthernet)
    if (lowerName.includes('virtual') || lowerName.includes('vbox') || lowerName.includes('vmware') || lowerName.includes('wsl')) {
      continue;
    }

    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('192.168.56.') || iface.address.startsWith('169.254.')) continue;
        
        const isWifi = lowerName.includes('wi-fi') || lowerName.includes('wifi') || lowerName.includes('wireless') || lowerName.includes('wlan');
        candidates.push({
          ip: iface.address,
          name,
          isWifi,
        });
      }
    }
  }

  // Prioritize Wi-Fi adapter
  const wifiCandidate = candidates.find(c => c.isWifi);
  if (wifiCandidate) return wifiCandidate.ip;
  if (candidates.length > 0) return candidates[0].ip;

  return 'localhost';
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
  // Pre-cleanup ports to avoid EADDRINUSE crash
  freePort(3000);
  freePort(3001);

  console.log('🔍 [1/4] Memeriksa koneksi digiCamControl (Kamera DSLR)...');
  let dccRunning = await checkDigiCamControl();
  if (!dccRunning) {
    const dccExe = 'C:\\Program Files (x86)\\digiCamControl\\CameraControl.exe';
    if (fs.existsSync(dccExe)) {
      console.log('   🔄 Menjalankan aplikasi digiCamControl secara otomatis...');
      try {
        execSync(`start "" "${dccExe}"`, { stdio: 'ignore', shell: true });
        console.log('   ⏳ Menunggu 5 detik agar digiCamControl siap...');
        await new Promise(r => setTimeout(r, 5000));
        dccRunning = await checkDigiCamControl();
      } catch (e) {}
    }
  }

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
  const nodeEnv = {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=4096`.trim(),
  };

  const cameraService = spawn('npm.cmd', ['run', 'dev'], {
    cwd: path.join(rootDir, 'camera-service'),
    stdio: 'inherit',
    shell: true,
    env: nodeEnv,
  });

  cameraService.on('error', (err) => {
    console.error('❌ Gagal menjalankan Camera Service:', err.message);
  });

  // 2. Start Web Server (Port 3000)
  console.log('🚀 [3/4] Menyalakan Web Kiosk Next.js (Port 3000)...');
  const webServer = spawn('npm.cmd', ['run', 'dev'], {
    cwd: path.join(rootDir, 'web'),
    stdio: 'inherit',
    shell: true,
    env: nodeEnv,
  });

  webServer.on('error', (err) => {
    console.error('❌ Gagal menjalankan Web Server:', err.message);
  });

  // 3. Start Cloudflare Tunnel (Opsional untuk Akses Publik / QRIS Online)
  console.log('🌐 [4/4] Mempersiapkan Akses Cloudflare Tunnel & WiFi Lokal...');
  const cloudflaredBin = getCloudflaredPath();
  let tunnelProcess = null;
  let tunnelFound = false;
  let bannerPrinted = false;

  function printReadyBanner(liveTunnelUrl = null) {
    if (bannerPrinted) return;
    bannerPrinted = true;

    const localIp = getLocalIp();

    console.log('');
    console.log('================================================================');
    console.log('  🎉 SEMUA SISTEM PHOTOBOOTH BERHASIL AKTIF & SIAP DIGUNAKAN!   ');
    console.log('================================================================');
    console.log(`  🖥️  Layar Utama di Laptop      : http://localhost:3000/photobooth`);
    console.log(`  📱  LINK BUKA DI IPAD (1 WiFi) : http://${localIp}:3000/photobooth`);
    if (liveTunnelUrl) {
      console.log(`  🌐  LINK BUKA DI IPAD (Cloud)   : ${liveTunnelUrl}/photobooth`);
    } else {
      console.log(`  🌐  Mode Akses                  : Jaringan Lokal / WiFi (Offline Ready)`);
    }
    console.log(`  💳  Payment Gateway             : DOKU (Otomatis Webhook & QRIS)`);
    console.log(`  ⚙️  Panel Admin Template        : http://${localIp}:3000/photobooth/admin (PIN: 12345)`);
    console.log('================================================================');
    console.log('  👉 DI IPAD: Buka salah satu link di atas pada browser Safari!');
    console.log('  👉 Cara 1 (Termudah): Tap tombol "Layar Penuh" di pojok kanan atas layar iPad!');
    console.log('  👉 Cara 2 (PWA): Tap Share [↑] -> pilih "Tambah ke Layar Utama" (Add to Home Screen)');
    console.log('  (Tekan Ctrl + C di terminal ini untuk mematikan semua server)');
    console.log('================================================================');

    // Buka browser otomatis ke photobooth
    try {
      execSync('start http://localhost:3000/photobooth', { stdio: 'ignore', shell: true });
    } catch (e) {}
  }

  // Safety fallback: jika tunnel butuh waktu lama atau offline, buka browser setelah 6 detik
  const bannerFallbackTimer = setTimeout(() => {
    printReadyBanner(null);
  }, 6000);

  let tunnelRetries = 0;
  function startTunnel() {
    if (!cloudflaredBin || tunnelFound) return;
    try {
      execSync('taskkill /F /IM cloudflared.exe', { stdio: 'ignore' });
    } catch (e) {}

    tunnelProcess = spawn(cloudflaredBin, ['tunnel', '--url', 'http://localhost:3000'], {
      shell: false,
    });

    const handleOutput = (data) => {
      const text = data.toString();
      const matches = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g);
      if (matches && !tunnelFound) {
        // Filter out Cloudflare API endpoint: api.trycloudflare.com is NOT the user tunnel!
        const validTunnel = matches.find((url) => !url.includes('api.trycloudflare.com'));
        if (validTunnel) {
          tunnelFound = true;
          clearTimeout(bannerFallbackTimer);
          const liveTunnelUrl = validTunnel;
        
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

          console.log(`   🌐 Cloudflare Tunnel Terhubung: ${liveTunnelUrl}`);
          printReadyBanner(liveTunnelUrl);
        }
      }
    };

    tunnelProcess.stdout.on('data', handleOutput);
    tunnelProcess.stderr.on('data', handleOutput);

    tunnelProcess.on('exit', (code) => {
      if (!tunnelFound) {
        if (tunnelRetries < 2) {
          tunnelRetries++;
          console.log(`   ⏳ Cloudflare tunnel mencoba menyambung kembali dalam 5 detik (Percobaan ${tunnelRetries}/2)...`);
          setTimeout(startTunnel, 5000);
        } else {
          console.log(`   ℹ️ Cloudflare tunnel offline. Sistem tetap berjalan sempurna menggunakan WiFi Lokal.`);
          printReadyBanner(null);
        }
      }
    });
  }

  if (cloudflaredBin) {
    startTunnel();
  } else {
    printReadyBanner(null);
  }

  // Keep event loop alive indefinitely so process never terminates unexpectedly
  setInterval(() => {}, 1000 * 60 * 60);

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

main().catch((err) => {
  console.error('Fatal error in launcher:', err);
});
