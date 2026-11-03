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

            // Temukan ukuran A4
            foreach (PaperSize ps in doc.PrinterSettings.PaperSizes) {
                if (ps.Kind == PaperKind.A4 || ps.PaperName.IndexOf("A4", StringComparison.OrdinalIgnoreCase) >= 0) {
                    doc.DefaultPageSettings.PaperSize = ps;
                    break;
                }
            }

            doc.DefaultPageSettings.Color = true;
            doc.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);
            doc.OriginAtMargins = false;

            // Parse slots
            List<int> slotList = new List<int>();
            bool isCenter = false;

            if (string.Equals(slots, "center", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(slots, "full", StringComparison.OrdinalIgnoreCase)) {
                isCenter = true;
            } else if (string.Equals(slots, "all", StringComparison.OrdinalIgnoreCase)) {
                for (int i = 1; i <= 8; i++) slotList.Add(i);
            } else {
                string[] parts = slots.Split(new char[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
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
                    Rectangle bounds = ev.PageBounds;

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
                    } else {
                        // 8 Slot: 4 Kolom x 2 Baris pada A4
                        // Baris 1: Slot 1, 2, 3, 4
                        // Baris 2: Slot 5, 6, 7, 8
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
                System.Threading.Thread.Sleep(2000);
            }
        }
    }
}
"@

if (-not ([System.Management.Automation.PSTypeName]'NativePhotoPrinter').Type) {
    Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing, System.Windows.Forms
}

[NativePhotoPrinter]::Print($ImagePath, $PrinterName, $Copies, $Slots)

Write-Output "SUCCESS: Printed to $PrinterName (Slots: $Slots, Copies: $Copies)"
