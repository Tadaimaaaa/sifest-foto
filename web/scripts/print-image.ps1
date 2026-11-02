param(
    [Parameter(Mandatory=$true)]
    [string]$ImagePath,

    [Parameter(Mandatory=$false)]
    [string]$PrinterName = "",

    [Parameter(Mandatory=$false)]
    [int]$Copies = 1
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

if ($Copies -gt 1) {
    $doc.PrinterSettings.Copies = [short]$Copies
}

$image = [System.Drawing.Image]::FromFile($ImagePath)

$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
$doc.OriginAtMargins = $true

$doc.add_PrintPage({
    param($sender, $ev)
    $bounds = $ev.MarginBounds
    if ($bounds.Width -le 0 -or $bounds.Height -le 0) {
        $bounds = $ev.PageBounds
    }

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

    $ev.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $ev.Graphics.DrawImage($image, $posX, $posY, $drawWidth, $drawHeight)
    $ev.HasMorePages = $false
})

$doc.Print()
$image.Dispose()
$doc.Dispose()

Write-Output "SUCCESS: Printed to $($doc.PrinterSettings.PrinterName)"
