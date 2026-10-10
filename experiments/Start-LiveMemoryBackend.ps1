param(
  [string]$Python = 'C:\Users\filma\Documents\Morph\Codex Plus\.venv\Scripts\python.exe',
  [switch]$Restart,
  [ValidateRange(1,5)][double]$NavEventHz = 2,
  [int]$WaitSeconds = 240
)
# Native 1280x720 Waypoint + SDXL HIGH + World Memory API v1.1 on port 8002 (backend only).
# Frontend: run Cursor's UI separately with ENGINE_TARGET / VITE_WORLD_API_BASE_URL = http://127.0.0.1:8002.
# The archived :8000 service is never touched by this script.
$ErrorActionPreference = 'Stop'
$env:HF_HUB_OFFLINE = '1'
$env:WORLDSHIFT_EXPERIMENT_MODEL = 'Overworld/Waypoint-1.5-1B'
$env:WORLDSHIFT_NAV_EVENT_HZ = "$NavEventHz"
# Freeze the view while the player is idle (no regeneration/drift when standing still).
$env:WORLDSHIFT_IDLE_HOLD = '1'
# Load SDXL into RAM at startup so 'capture clear view' (img2img enhancement) responds quickly.
$env:WORLDSHIFT_PREWARM_SDXL = '1'
# WebSocket origins are checked server-side; include Cursor dev (4821) and the native720 harness (4834).
$env:WORLDSHIFT_ORIGINS = @(3000, 4821, 4834 | ForEach-Object { "http://localhost:$_"; "http://127.0.0.1:$_" }) -join ','

$listener = Get-NetTCPConnection -State Listen -LocalPort 8002 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  if (-not $Restart) { throw 'Port 8002 is occupied. Inspect it, then rerun with -Restart to replace an idle WorldShift experimental service.' }
  $health = Invoke-RestMethod http://127.0.0.1:8002/health
  if ($health.status -ne 'ready') { throw "8002 status is '$($health.status)'. Stop its world first; refusing to interrupt an active world." }
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
  if ($proc.CommandLine -notmatch 'worldshift\.(memory_service|recovery_experiment):app.*--port 8002') {
    throw "8002 is not a WorldShift experimental service (`"$($proc.CommandLine)`"); refusing to stop it."
  }
  Stop-Process -Id $proc.ProcessId
  (Get-Process -Id $proc.ProcessId -ErrorAction SilentlyContinue) | ForEach-Object { $_.WaitForExit(15000) | Out-Null }
  if (Get-NetTCPConnection -State Listen -LocalPort 8002 -ErrorAction SilentlyContinue) { throw 'Previous process has not released 8002.' }
}

$backend = Start-Process -WindowStyle Hidden -FilePath $Python `
  -ArgumentList @('-m','uvicorn','worldshift.memory_service:app','--host','127.0.0.1','--port','8002','--workers','1','--ws-per-message-deflate','false') `
  -WorkingDirectory "$PSScriptRoot\backend" `
  -RedirectStandardOutput "$PSScriptRoot\live-memory.log" -RedirectStandardError "$PSScriptRoot\live-memory.err" -PassThru
$backend.Id | Set-Content "$PSScriptRoot\live-memory.pid"

$deadline = (Get-Date).AddSeconds($WaitSeconds)
do {
  Start-Sleep -Seconds 3
  try { $h = Invoke-RestMethod http://127.0.0.1:8002/health -TimeoutSec 3 } catch { $h = $null }
  if ($backend.HasExited) { throw "Backend exited early. See $PSScriptRoot\live-memory.err" }
} until (($h -and $h.model_loaded -and $h.status -eq 'ready') -or (Get-Date) -gt $deadline)
if (-not ($h -and $h.model_loaded)) { throw "Backend not ready after $WaitSeconds s. See $PSScriptRoot\live-memory.err" }
Write-Output "Ready: http://127.0.0.1:8002/health  model=$($h.model)  contract=$($h.contract)"
Write-Output ($h.capabilities | ConvertTo-Json -Compress)
