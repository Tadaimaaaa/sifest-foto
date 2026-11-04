param(
    [Parameter(Mandatory=$true)]
    [string]$ImagePath,

    [Parameter(Mandatory=$false)]
    [string]$PrinterName = "",

    [Parameter(Mandatory=$false)]
    [int]$Copies = 1,

    [Parameter(Mandatory=$false)]
    [string]$Slots = "1"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ImagePath)) {
    Write-Error "File not found: $ImagePath"
    exit 1
}

# Compile native C# printer to guarantee PrintPage fires on unmanaged GDI printing thread
$code = @"
using System;
using System.IO;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Printing;
using System.Collections.Generic;

public class NativePhotoPrinter {
    public static void Print(string imagePath, string printerName, int copies, string slots) {
        if (!File.Exists(imagePath)) {
            throw new FileNotFoundException("Image not found: " + imagePath);
        }

        using (PrintDocument doc = new PrintDocument()) {
            if (!string.IsNullOrWhiteSpace(printerName)) {
                doc.PrinterSettings.PrinterName = printerName;
            }

            if (!doc.PrinterSettings.IsValid) {
                throw new InvalidOperationException("Printer '" + doc.PrinterSettings.PrinterName + "' is invalid or not found.");
            }

            doc.PrintController = new StandardPrintController();
            doc.DocumentName = "SIFEST-PhotoStrip";

            if (copies > 1) {
                doc.PrinterSettings.Copies = (short)copies;
            }

            // Temukan ukuran kertas A4 resmi dari driver printer
            PaperSize a4Size = null;
            foreach (PaperSize ps in doc.PrinterSettings.PaperSizes) {
                if (ps.Kind == PaperKind.A4 || ps.PaperName.IndexOf("A4", StringComparison.OrdinalIgnoreCase) >= 0) {
                    a4Size = ps;
                    break;
                }
            }

            if (a4Size != null) {
                doc.DefaultPageSettings.PaperSize = a4Size;
                doc.PrinterSettings.DefaultPageSettings.PaperSize = a4Size;
            }

            // Margin aman 16 (0.16 inci = ~4mm) untuk mencegah penolakan hardware margin pada Epson L360
            Margins safeMargins = new Margins(16, 16, 16, 16);
            doc.DefaultPageSettings.Margins = safeMargins;
            doc.PrinterSettings.DefaultPageSettings.Margins = safeMargins;
            doc.OriginAtMargins = false;

            // Pastikan Mode Warna & Kualitas Tinggi (HD)
            doc.DefaultPageSettings.Color = true;
            doc.PrinterSettings.DefaultPageSettings.Color = true;
            foreach (PrinterResolution pr in doc.PrinterSettings.PrinterResolutions) {
                if (pr.Kind == PrinterResolutionKind.High) {
                    doc.DefaultPageSettings.PrinterResolution = pr;
                    doc.PrinterSettings.DefaultPageSettings.PrinterResolution = pr;
                    break;
                }
            }

            // Parse layout & slot
            List<int> slotList = new List<int>();
            bool isCenter = false;
            bool is6Slots = slots.StartsWith("6-") || slots.Contains("layout6");

            if (string.Equals(slots, "center", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(slots, "full", StringComparison.OrdinalIgnoreCase)) {
                isCenter = true;
            } else if (string.Equals(slots, "all", StringComparison.OrdinalIgnoreCase)) {
                int maxSlots = is6Slots ? 6 : 8;
                for (int i = 1; i <= maxSlots; i++) slotList.Add(i);
            } else {
                string cleanSlots = slots.Replace("6-", "").Replace("8-", "");
                string[] parts = cleanSlots.Split(new char[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (string p in parts) {
                    int num;
                    if (int.TryParse(p.Trim(), out num) && num >= 1 && num <= 8) {
                        if (!slotList.Contains(num)) slotList.Add(num);
                    }
                }
                if (slotList.Count == 0) slotList.Add(1);
            }

            using (Image image = Image.FromFile(imagePath)) {
                doc.PrintPage += (sender, ev) => {
                    // Batas halaman dengan margin aman dari tepi fisik kertas A4
                    Rectangle bounds = ev.PageBounds;
                    bounds.Inflate(-16, -16);

                    ev.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    ev.Graphics.SmoothingMode = SmoothingMode.HighQuality;
                    ev.Graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    ev.Graphics.CompositingQuality = CompositingQuality.HighQuality;

                    if (isCenter) {
                        float imgRatio = (float)image.Width / (float)image.Height;
                        float pageRatio = (float)bounds.Width / (float)bounds.Height;

                        int drawWidth = bounds.Width;
                        int drawHeight = bounds.Height;
                        int posX = bounds.X;
                        int posY = bounds.Y;

                        if (imgRatio > pageRatio) {
                            drawHeight = (int)(bounds.Width / imgRatio);
                            posY += (bounds.Height - drawHeight) / 2;
                        } else {
                            drawWidth = (int)(bounds.Height * imgRatio);
                            posX += (bounds.Width - drawWidth) / 2;
                        }

                        ev.Graphics.DrawImage(image, posX, posY, drawWidth, drawHeight);
                    } else if (is6Slots) {
                        // 6 Slot: 3 Kolom x 2 Baris pada A4
                        int cols = 3;
                        int rows = 2;
                        int slotW = bounds.Width / cols;
                        int slotH = bounds.Height / rows;

                        int padX = 8;
                        int padY = 12;
                        int availW = slotW - (padX * 2);
                        int availH = slotH - (padY * 2);

                        float imgRatio = (float)image.Width / (float)image.Height;
                        float slotRatio = (float)availW / (float)availH;

                        foreach (int slotNum in slotList) {
                            if (slotNum > 6) continue;
                            int row = (slotNum - 1) / cols;
                            int col = (slotNum - 1) % cols;

                            int slotX = bounds.X + (col * slotW);
                            int slotY = bounds.Y + (row * slotH);

                            int drawW = availW;
                            int drawH = availH;
                            int posX = slotX + padX;
                            int posY = slotY + padY;

                            if (imgRatio > slotRatio) {
                                drawH = (int)(availW / imgRatio);
                                posY += (availH - drawH) / 2;
                            } else {
                                drawW = (int)(availH * imgRatio);
                                posX += (availW - drawW) / 2;
                            }

                            ev.Graphics.DrawImage(image, posX, posY, drawW, drawH);
                        }
                    } else {
                        // 8 Slot: 4 Kolom x 2 Baris pada A4 (4 Atas x 4 Bawah)
                        int cols = 4;
                        int rows = 2;
                        int slotW = bounds.Width / cols;
                        int slotH = bounds.Height / rows;

                        int padX = 8;
                        int padY = 12;
                        int availW = slotW - (padX * 2);
                        int availH = slotH - (padY * 2);

                        float imgRatio = (float)image.Width / (float)image.Height;
                        float slotRatio = (float)availW / (float)availH;

                        foreach (int slotNum in slotList) {
                            int row = (slotNum - 1) / cols;
                            int col = (slotNum - 1) % cols;

                            int slotX = bounds.X + (col * slotW);
                            int slotY = bounds.Y + (row * slotH);

                            int drawW = availW;
                            int drawH = availH;
                            int posX = slotX + padX;
                            int posY = slotY + padY;

                            if (imgRatio > slotRatio) {
                                drawH = (int)(availW / imgRatio);
                                posY += (availH - drawH) / 2;
                            } else {
                                drawW = (int)(availH * imgRatio);
                                posX += (availW - drawW) / 2;
                            }

                            ev.Graphics.DrawImage(image, posX, posY, drawW, drawH);
                        }
                    }

                    ev.HasMorePages = false;
                };

                doc.Print();
                // Beri jeda 5 detik agar GDI spooler Windows selesai mentransfer seluruh byte raster ke driver
                System.Threading.Thread.Sleep(5000);
            }
        }
    }
}
"@

if (-not ([System.Management.Automation.PSTypeName]'NativePhotoPrinter').Type) {
    Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing, System.Windows.Forms
}

[NativePhotoPrinter]::Print($ImagePath, $PrinterName, $Copies, $Slots)

# Tunggu hingga spooler Windows selesai mendistribusikan job ke printer (maksimal 15 detik)
try {
    Add-Type -AssemblyName System.Printing -ErrorAction SilentlyContinue
    $ps = New-Object System.Printing.LocalPrintServer
    $pq = $ps.GetPrintQueue($PrinterName)
    $spoolWait = 0
    while ($spoolWait -lt 12) {
        $pq.Refresh()
        if ($pq.NumberOfJobs -eq 0) {
            break
        }
        Start-Sleep -Milliseconds 1000
        $spoolWait++
    }
} catch {
    Start-Sleep -Seconds 3
}

Write-Output "SUCCESS: Printed to $PrinterName (Slots: $Slots, Copies: $Copies)"
