# WorldShift AI — Windows PowerShell launcher
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

if (-not (Test-Path 'public\data\rescue\manifest.json')) {
  Write-Warning 'public\data\rescue\manifest.json missing. Copy the rescue handoff into public\data\rescue\'
}

Write-Host ''
Write-Host 'UI:             http://127.0.0.1:4821'
Write-Host 'Rescue Lab:     static JSON (no GPU / Python needed)'
Write-Host 'World Explorer: Codex Waypoint at http://127.0.0.1:8000 for real frames'
Write-Host ''
Write-Host 'Optional: set ENGINE_TARGET=http://127.0.0.1:8000 before starting for forced real engine.'
Write-Host 'Press Ctrl+C to stop.'
Write-Host ''

npm run dev
