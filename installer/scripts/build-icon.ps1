$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore, WindowsBase, System.Drawing
$setupIconAssets = Join-Path (Split-Path -Parent $PSScriptRoot) 'native\assets'
[xml]$setupIconSvg = Get-Content -LiteralPath (Join-Path $setupIconAssets 'context-anywhere.svg') -Raw
$setupIconDrawing = New-Object Windows.Media.DrawingVisual
$setupIconContext = $setupIconDrawing.RenderOpen()
try {
  foreach ($setupIconPath in $setupIconSvg.svg.path) {
    $setupIconFill = $null
    if ($setupIconPath.fill -ne 'none') { $setupIconFill = [Windows.Media.BrushConverter]::new().ConvertFromString($setupIconPath.fill) }
    $setupIconPen = $null
    if ($setupIconPath.stroke) {
      $setupIconPen = [Windows.Media.Pen]::new([Windows.Media.BrushConverter]::new().ConvertFromString($setupIconPath.stroke), [double]$setupIconPath.'stroke-width')
      $setupIconPen.StartLineCap = [Windows.Media.PenLineCap]::Round
      $setupIconPen.EndLineCap = [Windows.Media.PenLineCap]::Round
    }
    $setupIconContext.DrawGeometry($setupIconFill, $setupIconPen, [Windows.Media.Geometry]::Parse($setupIconPath.d))
  }
} finally { $setupIconContext.Close() }

# Supersample the editable SVG geometry, then filter each Windows icon size.
$setupIconRender = [Windows.Media.Imaging.RenderTargetBitmap]::new(1024, 1024, 384, 384, [Windows.Media.PixelFormats]::Pbgra32)
$setupIconRender.Render($setupIconDrawing)
$setupIconEncoder = [Windows.Media.Imaging.PngBitmapEncoder]::new()
$setupIconEncoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($setupIconRender))
$setupIconSourceStream = [IO.MemoryStream]::new()
$setupIconEncoder.Save($setupIconSourceStream)
$setupIconSourceStream.Position = 0
$setupIconSource = [Drawing.Bitmap]::FromStream($setupIconSourceStream)
$setupIconSizes = @(16, 20, 24, 32, 40, 48, 64, 128, 256)
$setupIconFrames = @()
try {
  foreach ($setupIconSize in $setupIconSizes) {
    $setupIconBitmap = [Drawing.Bitmap]::new($setupIconSize, $setupIconSize, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $setupIconGraphics = [Drawing.Graphics]::FromImage($setupIconBitmap)
    $setupIconFrameStream = [IO.MemoryStream]::new()
    try {
      $setupIconGraphics.CompositingMode = [Drawing.Drawing2D.CompositingMode]::SourceCopy
      $setupIconGraphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $setupIconGraphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $setupIconGraphics.DrawImage($setupIconSource, [Drawing.Rectangle]::new(0, 0, $setupIconSize, $setupIconSize))
      $setupIconBitmap.Save($setupIconFrameStream, [Drawing.Imaging.ImageFormat]::Png)
      $setupIconFrames += ,$setupIconFrameStream.ToArray()
      if ($setupIconSize -eq 256) { [IO.File]::WriteAllBytes((Join-Path $setupIconAssets 'context-anywhere.png'), $setupIconFrameStream.ToArray()) }
    } finally { $setupIconGraphics.Dispose(); $setupIconBitmap.Dispose(); $setupIconFrameStream.Dispose() }
  }
} finally { $setupIconSource.Dispose(); $setupIconSourceStream.Dispose() }

$setupIconFile = [IO.File]::Create((Join-Path $setupIconAssets 'context-anywhere.ico'))
$setupIconWriter = [IO.BinaryWriter]::new($setupIconFile)
try {
  $setupIconWriter.Write([uint16]0)
  $setupIconWriter.Write([uint16]1)
  $setupIconWriter.Write([uint16]$setupIconSizes.Count)
  $setupIconOffset = 6 + 16 * $setupIconSizes.Count
  for ($setupIconIndex = 0; $setupIconIndex -lt $setupIconSizes.Count; $setupIconIndex++) {
    $setupIconSizeByte = if ($setupIconSizes[$setupIconIndex] -eq 256) { 0 } else { $setupIconSizes[$setupIconIndex] }
    $setupIconWriter.Write([byte]$setupIconSizeByte)
    $setupIconWriter.Write([byte]$setupIconSizeByte)
    $setupIconWriter.Write([uint16]0)
    $setupIconWriter.Write([uint16]1)
    $setupIconWriter.Write([uint16]32)
    $setupIconWriter.Write([uint32]$setupIconFrames[$setupIconIndex].Length)
    $setupIconWriter.Write([uint32]$setupIconOffset)
    $setupIconOffset += $setupIconFrames[$setupIconIndex].Length
  }
  foreach ($setupIconFrame in $setupIconFrames) { $setupIconWriter.Write([byte[]]$setupIconFrame) }
} finally { $setupIconWriter.Dispose() }
Write-Output "Built Windows icon sizes: $($setupIconSizes -join ', ')"
