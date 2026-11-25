# Install a portable Tectonic LaTeX engine for PDF compilation.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/install-tectonic.ps1
$ErrorActionPreference = 'Stop'
$version = '0.15.0'
$homeDir = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
$target = Join-Path $homeDir 'sci-sideband\bin'
New-Item -ItemType Directory -Force -Path $target | Out-Null
$zip = Join-Path $target 'tectonic.zip'
$exe = Join-Path $target 'tectonic.exe'
if (Test-Path $exe) {
  Write-Output "Tectonic already installed: $exe"
  exit 0
}
$url = "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40$version/tectonic-$version-x86_64-pc-windows-msvc.zip"
Write-Output "Downloading $url"
Invoke-WebRequest -Uri $url -OutFile $zip
Expand-Archive -LiteralPath $zip -DestinationPath $target -Force
Remove-Item -LiteralPath $zip -Force
if (-not (Test-Path $exe)) { throw 'tectonic.exe was not extracted.' }
Write-Output "Installed: $exe"
