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

Add-Type -AssemblyName System.Drawing

$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
$doc.DocumentName = "SIFEST-PhotoStrip"

if (-not [string]::IsNullOrWhiteSpace($PrinterName)) {
    $doc.PrinterSettings.PrinterName = $PrinterName
}

if (-not $doc.PrinterSettings.IsValid) {
    Write-Error "Printer '$($doc.PrinterSettings.PrinterName)' is not valid or not found."
    exit 2
}

if ($Copies -gt 1) {
    $doc.PrinterSettings.Copies = [short]$Copies
}

# 1. Pastikan Kertas A4 & Mode Warna Aktif
$a4Size = $doc.PrinterSettings.PaperSizes | Where-Object { 
    $_.Kind -eq [System.Drawing.Printing.PaperKind]::A4 -or $_.PaperName -match 'A4' 
} | Select-Object -First 1

if ($a4Size) {
    $doc.DefaultPageSettings.PaperSize = $a4Size
}

$doc.DefaultPageSettings.Color = $true
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
$doc.OriginAtMargins = $false

$image = [System.Drawing.Image]::FromFile($ImagePath)

# Parse daftar slot yang dipilih (contoh: "1", "2", "1,2", "center")
# Layout 8 Bagian: 4 Atas (Slot 1, 2, 3, 4) & 4 Bawah (Slot 5, 6, 7, 8)
$slotList = @()
if ($Slots -eq "center" -or $Slots -eq "full") {
    $slotList = @("center")
} elseif ($Slots -eq "all") {
    $slotList = @(1, 2, 3, 4, 5, 6, 7, 8)
} else {
    $rawParts = $Slots.Split(",")
    foreach ($p in $rawParts) {
        $num = 0
        if ([int]::TryParse($p.Trim(), [ref]$num) -and $num -ge 1 -and $num -le 8) {
            $slotList += $num
        }
    }
    if ($slotList.Count -eq 0) {
        $slotList = @(1)
    }
}

$doc.add_PrintPage({
    param($sender, $ev)
    $bounds = $ev.PageBounds

    # Rendering Engine GDI+ Kualitas Tertinggi (Ultra-HD Bicubic & Anti-Aliasing)
    $ev.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $ev.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $ev.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $ev.Graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    if ($slotList -contains "center") {
        # Gambar di tengah halaman penuh (1 strip besar)
        $imgRatio = $image.Width / $image.Height
        $pageRatio = $bounds.Width / $bounds.Height
        $drawWidth = $bounds.Width
        $drawHeight = $bounds.Height
        $posX = $bounds.X
        $posY = $bounds.Y

        if ($imgRatio -gt $pageRatio) {
            $drawHeight = [int]($bounds.Width / $imgRatio)
            $posY += [int](($bounds.Height - $drawHeight) / 2)
        } else {
            $drawWidth = [int]($bounds.Height * $imgRatio)
            $posX += [int](($bounds.Width - $drawWidth) / 2)
        }

        $ev.Graphics.DrawImage($image, $posX, $posY, $drawWidth, $drawHeight)
    } else {
        # Grid 8 Slot pada Kertas A4 (4 Kolom x 2 Baris)
        # Baris 1 (Atas): Slot 1, Slot 2, Slot 3, Slot 4
        # Baris 2 (Bawah): Slot 5, Slot 6, Slot 7, Slot 8
        $cols = 4
        $rows = 2
        $slotW = $bounds.Width / $cols
        $slotH = $bounds.Height / $rows

        foreach ($slotNum in $slotList) {
            $row = [math]::Floor(($slotNum - 1) / $cols)
            $col = ($slotNum - 1) % $cols

            $slotX = $bounds.X + ($col * $slotW)
            $slotY = $bounds.Y + ($row * $slotH)

            # Padding dalam batas slot agar pas dan rapi
            $padX = 8
            $padY = 12
            $availW = $slotW - ($padX * 2)
            $availH = $slotH - ($padY * 2)

            $imgRatio = $image.Width / $image.Height
            $slotRatio = $availW / $availH

            $drawW = $availW
            $drawH = $availH
            $posX = $slotX + $padX
            $posY = $slotY + $padY

            if ($imgRatio -gt $slotRatio) {
                $drawH = [int]($availW / $imgRatio)
                $posY += [int](($availH - $drawH) / 2)
            } else {
                $drawW = [int]($availH * $imgRatio)
                $posX += [int](($availW - $drawW) / 2)
            }

            $ev.Graphics.DrawImage($image, $posX, $posY, $drawW, $drawH)
        }
    }

    $ev.HasMorePages = $false
})

$doc.Print()

# Berikan jeda 1.5 detik agar spooler Windows selesai mem-buffer seluruh dokumen ke driver USB
Start-Sleep -Milliseconds 1500

$image.Dispose()
$doc.Dispose()

Write-Output "SUCCESS: Printed to $($doc.PrinterSettings.PrinterName) (Paper: Premium Glossy A4, Slots: $($slotList -join ','))"
