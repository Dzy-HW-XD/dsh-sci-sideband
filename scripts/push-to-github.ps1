# Push this repository to GitHub with a locally entered token.
#
# The token is read with Read-Host (hidden), kept only in this process's
# environment for the duration of the push, and never written to disk or
# printed. Use a classic PAT with `repo`, or a fine-grained PAT with
# Contents: Read and write on Dzy-HW-XD/dsh-sci-sideband.
#
# Usage (from the repository root):
#   powershell -ExecutionPolicy Bypass -File .\scripts\push-to-github.ps1

param(
  [string]$Repo = "Dzy-HW-XD/dsh-sci-sideband",
  [string]$Remote = "https://github.com/Dzy-HW-XD/dsh-sci-sideband.git"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  $secure = Read-Host "GitHub PAT (hidden; repo or Contents: Read+Write)" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  if ([string]::IsNullOrWhiteSpace($token)) { throw "empty token" }

  $env:GH_TOKEN = $token
  $env:GIT_TERMINAL_PROMPT = "0"

  git remote set-url origin $Remote
  $helper = '!f() { echo username=x-access-token; echo password=$GH_TOKEN; }; f'

  Write-Host "pushing main to $Repo ..."
  git -c credential.helper= -c "credential.helper=$helper" push -u origin main
  if ($LASTEXITCODE -ne 0) { throw "push main failed" }

  Write-Host "pushing tag v0.1.0 ..."
  git -c credential.helper= -c "credential.helper=$helper" push origin v0.1.0
  if ($LASTEXITCODE -ne 0) { throw "push tag failed" }

  Write-Host "done: https://github.com/$Repo"
} finally {
  Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:GIT_TERMINAL_PROMPT -ErrorAction SilentlyContinue
  $token = $null
  Pop-Location
}
