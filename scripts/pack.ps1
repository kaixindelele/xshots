$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -Raw -Encoding UTF8 -Path (Join-Path $root 'manifest.json') | ConvertFrom-Json
$version = $manifest.version
$distDir = Join-Path $root 'dist'
$stageDir = Join-Path $distDir '_stage'
$zipPath = Join-Path $distDir "Xshots-$version.zip"

if (Test-Path $stageDir) { Remove-Item -Recurse -Force $stageDir }
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

$items = @(
  'manifest.json',
  'shared.js',
  'content.js',
  'content.css',
  'background.js',
  'offscreen.html',
  'offscreen.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'LICENSE',
  'PRIVACY.md',
  'README.md',
  'icons',
  'vendor'
)

foreach ($item in $items) {
  Copy-Item -Recurse -Force -Path (Join-Path $root $item) -Destination (Join-Path $stageDir $item)
}

Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $zipPath -Force
Remove-Item -Recurse -Force $stageDir
Write-Output "Packed: $zipPath ($((Get-Item $zipPath).Length) bytes)"
