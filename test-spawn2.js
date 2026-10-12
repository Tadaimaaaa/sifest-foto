const { spawn } = require('child_process');
const cmd = 'C:\\Program Files (x86)\\digiCamControl\\CameraControlRemoteCmd.exe';
const args = ['/c', 'captureNoAf', 'D:\\HMJ SI\\Festival HMJ SI\\Website\\sifest-foto\\storage\\sessions\\TEST-MANUAL\\original\\photo-5.jpg'];
const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
child.stdout.on('data', d => process.stdout.write(d));
child.stderr.on('data', d => process.stderr.write(d));
child.on('close', c => console.log('Exited with', c));
