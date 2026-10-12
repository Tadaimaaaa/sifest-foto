import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

export interface PrintAdapter {
  print(jobId: string, filePath: string, copies: number): Promise<void>;
  isPrinterReady(): Promise<boolean>;
}

export class MockPrintAdapter implements PrintAdapter {
  async print(jobId: string, filePath: string, copies: number): Promise<void> {
    console.log(`[MockPrintAdapter] Simulating print for ${jobId} (Copies: ${copies})`);
    console.log(`[MockPrintAdapter] Target file: ${filePath}`);
    
    // Simulate printing delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log(`[MockPrintAdapter] Print successful for ${jobId}`);
  }

  async isPrinterReady(): Promise<boolean> {
    return true; // Always ready for mock
  }
}

export class WindowsPrintAdapter implements PrintAdapter {
  private printerName: string | undefined;

  constructor() {
    this.printerName = process.env.PRINTER_NAME;
  }

  async isPrinterReady(): Promise<boolean> {
    // Basic check for Windows: if PRINTER_NAME is set, assume it might be ready.
    // In production, you would run a PowerShell command to check printer status.
    return !!this.printerName;
  }

  async print(jobId: string, filePath: string, copies: number): Promise<void> {
    if (!this.printerName) {
      throw new Error('PRINTER_NAME environment variable is not configured.');
    }

    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`File to print not found: ${filePath}`);
    }

    // SECURITY WARNING: In a real implementation, you MUST thoroughly sanitize filePath and printerName.
    // For now, we use double quotes, but be extremely careful with command injection on Windows.
    // We recommend using built-in Windows APIs or safe wrappers (like 'pdf-to-printer' if PDF, or ImageMagick).
    // Here we use a generic PowerShell approach to print an image.
    
    // Validate path
    if (filePath.includes('"') || filePath.includes(';')) {
      throw new Error('Invalid characters in file path.');
    }

    // Windows shell print command (placeholder for actual driver command)
    // Note: PowerShell Start-Process with -Verb Print doesn't easily support copies or specific printers without showing a dialog for images.
    // In a real environment, you might use an external CLI like IrfanView or SumatraPDF.
    
    console.log(`[WindowsPrintAdapter] Sending ${filePath} to printer ${this.printerName}`);
    
    // Using a safe placeholder command that simulates printing natively
    // We throw an error if the user tries to use the Windows adapter without proper CLI tool configured.
    if (!process.env.PRINT_CLI_TOOL_PATH) {
      throw new Error('PRINT_CLI_TOOL_PATH not configured. Windows printing requires an external CLI (like IrfanView).');
    }

    const cliTool = process.env.PRINT_CLI_TOOL_PATH;
    // Example for IrfanView: i_view64.exe c:\file.jpg /print="Printer Name"
    const command = `"${cliTool}" "${filePath}" /print="${this.printerName}"`;
    
    for (let i = 0; i < copies; i++) {
       await execAsync(command);
    }
  }
}

export function getPrintAdapter(): PrintAdapter {
  if (process.env.NODE_ENV === 'production' && process.env.PRINTER_NAME) {
    return new WindowsPrintAdapter();
  }
  return new MockPrintAdapter();
}
