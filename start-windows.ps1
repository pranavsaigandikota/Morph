# WorldShift AI — Windows PowerShell launcher (prefers real Codex on :8000)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

Write-Host '============================================'
Write-Host ' WorldShift AI - Windows quick start'
Write-Host '============================================'
Write-Host ''

function Require-Cmd([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name not found. Install Node.js LTS from https://nodejs.org and reopen PowerShell."
  }
}

Require-Cmd node
Require-Cmd npm

if (-not (Test-Path 'node_modules')) {
  Write-Host 'Installing dependencies (first run)...'
  npm install
}

if (-not (Test-Path '.env') -and (Test-Path '.env.example')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'Created .env from .env.example'
}

if (-not (Test-Path 'public\data\rescue\manifest.json')) {
  Write-Warning 'public\data\rescue\manifest.json missing. Copy the rescue handoff into public\data\rescue\'
}

Write-Host ''
Write-Host 'UI:             http://127.0.0.1:4821'
Write-Host 'World Explorer: http://127.0.0.1:4821/world'
Write-Host 'Rescue Lab:     http://127.0.0.1:4821/simulation (static JSON)'
Write-Host 'Codex target:   http://127.0.0.1:8000'
Write-Host ''
Write-Host 'Default npm run dev does NOT auto-start mock if :8000 is down.'
Write-Host 'Explicit mock:  npm run dev:mock'
Write-Host 'GPU checklist:  docs\WINDOWS_VERIFY.md'
Write-Host 'Press Ctrl+C to stop.'
Write-Host ''

if ($env:USE_MOCK_ENGINE -eq '1') {
  npm run dev:mock
} else {
  npm run dev
}
