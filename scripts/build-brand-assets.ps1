$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

Add-Type -ReferencedAssemblies @([System.Drawing.Bitmap].Assembly.Location) -TypeDefinition @'
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class JobFlowBrandAsset {
  static void RoundedRect(Graphics g, Pen p, Rectangle r, int radius) {
    using (GraphicsPath path = new GraphicsPath()) {
      int d = radius * 2;
      path.AddArc(r.X, r.Y, d, d, 180, 90);
      path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
      path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
      path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
      path.CloseFigure();
      g.DrawPath(p, path);
    }
  }

  public static byte[] RenderPng(int size) {
    using (Bitmap bitmap = new Bitmap(size, size, PixelFormat.Format32bppArgb))
    using (Graphics g = Graphics.FromImage(bitmap)) {
      g.SmoothingMode = SmoothingMode.AntiAlias;
      g.PixelOffsetMode = PixelOffsetMode.HighQuality;
      g.ScaleTransform(size / 256f, size / 256f);
      using (GraphicsPath tile = new GraphicsPath()) {
        tile.AddArc(0, 0, 124, 124, 180, 90);
        tile.AddArc(132, 0, 124, 124, 270, 90);
        tile.AddArc(132, 132, 124, 124, 0, 90);
        tile.AddArc(0, 132, 124, 124, 90, 90);
        tile.CloseFigure();
        using (LinearGradientBrush fill = new LinearGradientBrush(new Point(28,18), new Point(226,242), Color.FromArgb(255,102,132,245), Color.FromArgb(255,48,75,183)))
          g.FillPath(fill, tile);
      }
      using (Pen border = new Pen(Color.FromArgb(46,255,255,255), 2)) RoundedRect(g, border, new Rectangle(9,9,238,238), 55);
      using (GraphicsPath route = new GraphicsPath()) {
        route.AddLine(82,76,173,76);
        route.AddLine(173,76,173,133);
        route.AddBezier(173,133,173,162,155,181,126,181);
        route.AddBezier(126,181,106,181,91,172,81,156);
        using (Pen pen = new Pen(Color.FromArgb(255,244,247,255), 17)) {
          pen.StartCap = LineCap.Round; pen.EndCap = LineCap.Round; pen.LineJoin = LineJoin.Round;
          g.DrawPath(pen, route);
        }
      }
      using (SolidBrush start = new SolidBrush(Color.FromArgb(255,231,238,255))) g.FillEllipse(start,71,65,22,22);
      using (SolidBrush end = new SolidBrush(Color.FromArgb(255,108,227,192))) g.FillEllipse(end,68,143,26,26);
      using (Pen marker = new Pen(Color.FromArgb(255,243,255,252), 5)) g.DrawEllipse(marker,68,143,26,26);
      using (MemoryStream stream = new MemoryStream()) { bitmap.Save(stream, ImageFormat.Png); return stream.ToArray(); }
    }
  }
}
'@

$appRoot = Split-Path -Parent $PSScriptRoot
$publicDir = Join-Path $appRoot 'public'
$buildDir = Join-Path $appRoot 'build-assets'
New-Item -ItemType Directory -Path $publicDir, $buildDir -Force | Out-Null
[System.IO.File]::WriteAllBytes((Join-Path $publicDir 'jobflow-icon.png'), [JobFlowBrandAsset]::RenderPng(256))

$sizes = @(256, 128, 64, 48, 32, 16)
$images = foreach ($size in $sizes) { [pscustomobject]@{ Size = $size; Bytes = [JobFlowBrandAsset]::RenderPng($size) } }
$iconPath = Join-Path $buildDir 'jobflow.ico'
$stream = [System.IO.File]::Create($iconPath)
$writer = [System.IO.BinaryWriter]::new($stream)
$writer.Write([UInt16]0); $writer.Write([UInt16]1); $writer.Write([UInt16]$images.Count)
$offset = 6 + 16 * $images.Count
foreach ($image in $images) {
  $dimension = if ($image.Size -eq 256) { [byte]0 } else { [byte]$image.Size }
  $writer.Write($dimension); $writer.Write($dimension); $writer.Write([byte]0); $writer.Write([byte]0)
  $writer.Write([UInt16]1); $writer.Write([UInt16]32); $writer.Write([UInt32]$image.Bytes.Length); $writer.Write([UInt32]$offset)
  $offset += $image.Bytes.Length
}
foreach ($image in $images) { $writer.Write($image.Bytes) }
$writer.Dispose(); $stream.Dispose()
Write-Output "Created $iconPath"
