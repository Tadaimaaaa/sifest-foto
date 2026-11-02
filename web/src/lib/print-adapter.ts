import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';

const execAsync = promisify(exec);

export interface PrintAdapter {
  print(jobId: string, filePath: string, copies: number): Promise<void>;
  isPrinterReady(): Promise<boolean>;
}

export class MockPrintAdapter implements PrintAdapter {
  async print(jobId: string, filePath: string, copies: number): Promise<void> {
    console.log(`[MockPrintAdapter] Simulating print for ${jobId} (Copies: ${copies})`);
    console.log(`[MockPrintAdapter] Target file: ${filePath}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log(`[MockPrintAdapter] Print successful for ${jobId}`);
  }

  async isPrinterReady(): Promise<boolean> {
    return true;
  }
}

export class WindowsPrintAdapter implements PrintAdapter {
  private printerName: string | undefined;

  constructor() {
    this.printerName = process.env.PRINTER_NAME;
  }

  async getTargetPrinter(): Promise<string> {
    if (this.printerName && this.printerName.trim() !== '') {
      return this.printerName;
    }
    // Deteksi printer default di Windows secara otomatis
    try {
      const { stdout } = await execAsync(
        `powershell -NoProfile -Command "Add-Type -AssemblyName System.Drawing; [System.Drawing.Printing.PrinterSettings]::new().PrinterName"`
      );
      const detected = stdout.trim();
      if (detected) {
        this.printerName = detected;
        return detected;
      }
    } catch {}
    return 'EPSON L360 Series';
  }

  async isPrinterReady(): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        `powershell -NoProfile -Command "Add-Type -AssemblyName System.Drawing; [System.Drawing.Printing.PrinterSettings]::new().IsValid"`
      );
      return stdout.trim().toLowerCase() === 'true';
    } catch {
      return false;
    }
  }

  async print(jobId: string, filePath: string, copies: number): Promise<void> {
    const absoluteFile = path.resolve(filePath);
    try {
      await fs.access(absoluteFile);
    } catch {
      throw new Error(`File foto cetak tidak ditemukan: ${absoluteFile}`);
    }

    const printer = await this.getTargetPrinter();
    console.log(`[WindowsPrintAdapter] Mencetak ${absoluteFile} ke printer '${printer}' (${copies} lembar)...`);

    // Cari lokasi print-image.ps1
    const possibleScriptPaths = [
      path.resolve(process.cwd(), 'scripts/print-image.ps1'),
      path.resolve(process.cwd(), 'web/scripts/print-image.ps1'),
      path.resolve(__dirname, '../../scripts/print-image.ps1'),
      path.resolve(__dirname, '../../../scripts/print-image.ps1'),
    ];
    const scriptPath = possibleScriptPaths.find(p => fsSync.existsSync(p));

    if (!scriptPath) {
      throw new Error(`Script pencetak print-image.ps1 tidak ditemukan.`);
    }

    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -ImagePath "${absoluteFile}" -PrinterName "${printer}" -Copies ${copies}`;
    const { stdout, stderr } = await execAsync(cmd, { timeout: 45000 });

    if (stderr && stderr.includes('Error')) {
      throw new Error(stderr.trim());
    }
    console.log(`[WindowsPrintAdapter] ${stdout.trim()}`);
  }
}

export function getPrintAdapter(): PrintAdapter {
  // Jika berjalan di sistem operasi Windows, selalu gunakan WindowsPrintAdapter langsung ke printer fisik
  if (process.platform === 'win32') {
    return new WindowsPrintAdapter();
  }
  return new MockPrintAdapter();
}
