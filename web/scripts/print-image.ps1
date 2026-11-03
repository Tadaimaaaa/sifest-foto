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

if (-not [string]::IsNullOrWhiteSpace($PrinterName)) {
    $doc.PrinterSettings.PrinterName = $PrinterName
}

if (-not $doc.PrinterSettings.IsValid) {
    Write-Error "Printer '$($doc.PrinterSettings.PrinterName)' is not valid or not found."
    exit 2
}

# 1. Konfigurasi Driver Printer ke Kertas Premium Glossy & Kualitas Cetak HD (High Quality)
try {
    $targetPrinterName = $doc.PrinterSettings.PrinterName
    $config = Get-PrintConfiguration -PrinterName $targetPrinterName -ErrorAction SilentlyContinue
    if ($config -and $config.PrintTicketXML) {
        [xml]$ticket = $config.PrintTicketXML
        $changed = $false

        # Set Jenis Kertas: PhotographicHighGloss (Epson Premium Glossy / Photo Paper Glossy)
        $mediaType = $ticket.PrintTicket.Feature | Where-Object { $_.name -eq 'psk:PageMediaType' }
        if ($mediaType -and $mediaType.Option.name -ne 'psk:PhotographicHighGloss') {
            $mediaType.Option.name = 'psk:PhotographicHighGloss'
            $changed = $true
        }

        # Set Kualitas Output: HighQuality (Kualitas Cetak Foto HD)
        $quality = $ticket.PrintTicket.Feature | Where-Object { $_.name -eq 'psk:PageOutputQuality' }
        if ($quality -and $quality.Option.name -ne 'ns0000:HighQuality') {
            $quality.Option.name = 'ns0000:HighQuality'
            $changed = $true
        }

        # Set Resolusi: Quality (720x720 DPI HD)
        $res = $ticket.PrintTicket.Feature | Where-Object { $_.name -eq 'psk:PageResolution' }
        if ($res -and $res.Option.name -ne 'ns0000:Quality') {
            $res.Option.name = 'ns0000:Quality'
            $changed = $true
        }

        if ($changed) {
            Set-PrintConfiguration -PrinterName $targetPrinterName -PrintTicketXml $ticket.OuterXml -ErrorAction SilentlyContinue
        }
    }
} catch {
    # Abaikan jika driver tidak mendukung print ticket XML
}

if ($Copies -gt 1) {
    $doc.PrinterSettings.Copies = [short]$Copies
}

# 2. Aktifkan Mode Warna & Resolusi High pada PageSettings .NET
$doc.DefaultPageSettings.Color = $true
$highRes = $doc.PrinterSettings.PrinterResolutions | Where-Object {
    $_.Kind -eq [System.Drawing.Printing.PrinterResolutionKind]::High
}
if ($highRes) {
    $doc.DefaultPageSettings.PrinterResolution = $highRes
}

$image = [System.Drawing.Image]::FromFile($ImagePath)

$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
$doc.OriginAtMargins = $true

# Parse daftar slot yang dipilih (contoh: "1", "2", "1,2", "center")
$slotList = @()
if ($Slots -eq "center" -or $Slots -eq "full") {
    $slotList = @("center")
} elseif ($Slots -eq "all") {
    $slotList = @(1, 2, 3, 4, 5, 6)
} else {
    $rawParts = $Slots.Split(",")
    foreach ($p in $rawParts) {
        $num = 0
        if ([int]::TryParse($p.Trim(), [ref]$num) -and $num -ge 1 -and $num -le 6) {
            $slotList += $num
        }
    }
    if ($slotList.Count -eq 0) {
        $slotList = @(1)
    }
}

$doc.add_PrintPage({
    param($sender, $ev)
    $bounds = $ev.MarginBounds
    if ($bounds.Width -le 0 -or $bounds.Height -le 0) {
        $bounds = $ev.PageBounds
    }

    # 3. Rendering Engine GDI+ Kualitas Tertinggi (Ultra-HD Bicubic & Anti-Aliasing)
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
        # Grid 6 Slot pada Kertas A4 (3 Kolom x 2 Baris)
        # Baris 1 (Atas): Slot 1 (Kiri), Slot 2 (Tengah), Slot 3 (Kanan)
        # Baris 2 (Bawah): Slot 4 (Kiri), Slot 5 (Tengah), Slot 6 (Kanan)
        $cols = 3
        $rows = 2
        $slotW = $bounds.Width / $cols
        $slotH = $bounds.Height / $rows

        foreach ($slotNum in $slotList) {
            $row = [math]::Floor(($slotNum - 1) / $cols)
            $col = ($slotNum - 1) % $cols

            $slotX = $bounds.X + ($col * $slotW)
            $slotY = $bounds.Y + ($row * $slotH)

            # Padding dalam batas slot agar tidak mepet batas potong
            $padX = 10
            $padY = 15
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
$image.Dispose()
$doc.Dispose()

Write-Output "SUCCESS: Printed to $($doc.PrinterSettings.PrinterName) (Paper: Premium Glossy HD, Slots: $($slotList -join ','))"
