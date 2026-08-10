Add-Type -AssemblyName System.Drawing

function Get-TrimBounds {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    [int]$AlphaThreshold = 8
  )

  $minX = $Bitmap.Width
  $minY = $Bitmap.Height
  $maxX = -1
  $maxY = -1

  for ($y = 0; $y -lt $Bitmap.Height; $y++) {
    for ($x = 0; $x -lt $Bitmap.Width; $x++) {
      if ($Bitmap.GetPixel($x, $y).A -gt $AlphaThreshold) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }

  if ($maxX -lt $minX -or $maxY -lt $minY) {
    return [System.Drawing.Rectangle]::FromLTRB(0, 0, $Bitmap.Width, $Bitmap.Height)
  }

  return [System.Drawing.Rectangle]::FromLTRB($minX, $minY, $maxX + 1, $maxY + 1)
}

function Copy-SubBitmap {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    [System.Drawing.Rectangle]$Rect
  )

  $out = New-Object System.Drawing.Bitmap($Rect.Width, $Rect.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  for ($y = 0; $y -lt $Rect.Height; $y++) {
    for ($x = 0; $x -lt $Rect.Width; $x++) {
      $out.SetPixel($x, $y, $Bitmap.GetPixel($Rect.X + $x, $Rect.Y + $y))
    }
  }
  return $out
}

function Remove-BackgroundByFloodFill {
  param(
    [string]$InputPath,
    [int]$SeedTolerance = 80,
    [int]$NeighborTolerance = 22
  )

  $source = [System.Drawing.Bitmap]::FromFile($InputPath)
  $bmp = New-Object System.Drawing.Bitmap($source.Width, $source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bmp)
  $graphics.DrawImage($source, 0, 0, $source.Width, $source.Height)
  $graphics.Dispose()
  $source.Dispose()

  $w = $bmp.Width
  $h = $bmp.Height
  $visited = New-Object 'bool[,]' $w, $h
  $queue = New-Object System.Collections.Generic.Queue[System.Drawing.Point]

  $seeds = @(
    [System.Drawing.Point]::new(0, 0),
    [System.Drawing.Point]::new($w - 1, 0),
    [System.Drawing.Point]::new(0, $h - 1),
    [System.Drawing.Point]::new($w - 1, $h - 1)
  )
  $seedColors = @()
  foreach ($seed in $seeds) {
    $queue.Enqueue($seed)
    $visited[$seed.X, $seed.Y] = $true
    $seedColors += $bmp.GetPixel($seed.X, $seed.Y)
  }

  while ($queue.Count -gt 0) {
    $point = $queue.Dequeue()
    $current = $bmp.GetPixel($point.X, $point.Y)
    $seedMatch = $false
    foreach ($seedColor in $seedColors) {
      $dr = [Math]::Abs($current.R - $seedColor.R)
      $dg = [Math]::Abs($current.G - $seedColor.G)
      $db = [Math]::Abs($current.B - $seedColor.B)
      if ($dr -le $SeedTolerance -and $dg -le $SeedTolerance -and $db -le $SeedTolerance) {
        $seedMatch = $true
        break
      }
    }

    if (-not $seedMatch) {
      continue
    }

    $transparent = [System.Drawing.Color]::FromArgb(0, $current.R, $current.G, $current.B)
    $bmp.SetPixel($point.X, $point.Y, $transparent)

    foreach ($dx in -1..1) {
      foreach ($dy in -1..1) {
        if ($dx -eq 0 -and $dy -eq 0) {
          continue
        }

        $nx = $point.X + $dx
        $ny = $point.Y + $dy
        if ($nx -lt 0 -or $ny -lt 0 -or $nx -ge $w -or $ny -ge $h) {
          continue
        }
        if ($visited[$nx, $ny]) {
          continue
        }

        $neighbor = $bmp.GetPixel($nx, $ny)
        $dr = [Math]::Abs($neighbor.R - $current.R)
        $dg = [Math]::Abs($neighbor.G - $current.G)
        $db = [Math]::Abs($neighbor.B - $current.B)
        if ($dr -le $NeighborTolerance -and $dg -le $NeighborTolerance -and $db -le $NeighborTolerance) {
          $visited[$nx, $ny] = $true
          $queue.Enqueue([System.Drawing.Point]::new($nx, $ny))
        }
      }
    }
  }

  return $bmp
}

function Fit-ToCanvas {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    [int]$TargetWidth,
    [int]$TargetHeight,
    [double]$Scale = 1.0,
    [int]$OffsetX = 0,
    [int]$OffsetY = 0
  )

  $trimRect = Get-TrimBounds -Bitmap $Bitmap
  $trimmed = Copy-SubBitmap -Bitmap $Bitmap -Rect $trimRect

  $scaledWidth = [Math]::Max(1, [int][Math]::Round($trimmed.Width * $Scale))
  $scaledHeight = [Math]::Max(1, [int][Math]::Round($trimmed.Height * $Scale))
  $scaled = New-Object System.Drawing.Bitmap($scaledWidth, $scaledHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($scaled)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
  $graphics.DrawImage($trimmed, 0, 0, $scaledWidth, $scaledHeight)
  $graphics.Dispose()
  $trimmed.Dispose()

  $canvas = New-Object System.Drawing.Bitmap($TargetWidth, $TargetHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $canvasG = [System.Drawing.Graphics]::FromImage($canvas)
  $canvasG.Clear([System.Drawing.Color]::Transparent)
  $x = [int][Math]::Floor(($TargetWidth - $scaledWidth) / 2) + $OffsetX
  $y = $TargetHeight - $scaledHeight + $OffsetY
  $canvasG.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $canvasG.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $canvasG.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $canvasG.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
  $canvasG.DrawImage($scaled, $x, $y, $scaledWidth, $scaledHeight)
  $canvasG.Dispose()
  $scaled.Dispose()

  return $canvas
}

function Save-Png {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    [string]$OutputPath
  )

  $Bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
}

$root = 'C:\Spel\Viking-Vs-Cleo\Viking-Vs-Cleo'
$assetDir = Join-Path $root 'public\assets\cleo'
$sourceDir = Join-Path $root 'source-images'

$attack1Input = Join-Path $sourceDir 'cleo_melee_punch_frame_1.png'
$attack2Input = Join-Path $assetDir 'attack2_punch_right_hand_facing_left_flipped.png'

$attack1Canvas = Fit-ToCanvas -Bitmap ([System.Drawing.Bitmap]::FromFile($attack1Input)) -TargetWidth 178 -TargetHeight 185 -Scale 0.24 -OffsetX 0 -OffsetY 0
$attack2Removed = Remove-BackgroundByFloodFill -InputPath $attack2Input
$attack2Canvas = Fit-ToCanvas -Bitmap $attack2Removed -TargetWidth 178 -TargetHeight 185 -Scale 0.155 -OffsetX 0 -OffsetY 0

try {
  Copy-Item -LiteralPath (Join-Path $assetDir 'attack1.png') -Destination (Join-Path $assetDir 'attack1.original.png') -Force
  Copy-Item -LiteralPath (Join-Path $assetDir 'attack2.png') -Destination (Join-Path $assetDir 'attack2.previous-opaque.png') -Force
  Copy-Item -LiteralPath (Join-Path $assetDir 'attack3.png') -Destination (Join-Path $assetDir 'attack3.original.png') -Force

  Save-Png -Bitmap $attack1Canvas -OutputPath (Join-Path $assetDir 'attack1.png')
  Save-Png -Bitmap $attack2Canvas -OutputPath (Join-Path $assetDir 'attack2.png')
  Save-Png -Bitmap $attack2Canvas -OutputPath (Join-Path $assetDir 'attack3.png')

  Save-Png -Bitmap $attack1Canvas -OutputPath (Join-Path $sourceDir 'cleo_melee_attack_frame_1.transparent-runtime.png')
  Save-Png -Bitmap $attack2Canvas -OutputPath (Join-Path $sourceDir 'cleo_melee_attack_frame_2.transparent-runtime.png')
  Save-Png -Bitmap $attack2Canvas -OutputPath (Join-Path $sourceDir 'cleo_melee_attack_frame_3.transparent-runtime.png')
}
finally {
  $attack1Canvas.Dispose()
  $attack2Removed.Dispose()
  $attack2Canvas.Dispose()
}
