param(
  [string]$BackendRoot='C:\Users\filma\Documents\Morph\Codex Plus',
  [string]$FrontendRoot=(Split-Path -Parent $PSScriptRoot)
)
$ErrorActionPreference='Stop'
$backend=(Resolve-Path -LiteralPath $BackendRoot).Path
$frontend=(Resolve-Path -LiteralPath $FrontendRoot).Path
$python=Join-Path $backend '.venv\Scripts\python.exe'
$vite=Join-Path $frontend 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $python) -or -not (Test-Path -LiteralPath $vite)) {throw 'Use the existing service environment and install frontend dependencies before launch.'}
$logs=Join-Path $backend 'work\startup-logs'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$created=@()
function Health {try {Invoke-RestMethod http://127.0.0.1:8000/health -TimeoutSec 2} catch {$null}}
try {
  $health=Health
  if (-not $health) {
    if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) {throw 'Port8000 is occupied by an unexpected service; do not launch another GPU model.'}
    $args=@('-m','uvicorn','worldshift.scene_service:app','--host','127.0.0.1','--port','8000','--workers','1','--ws-max-size','4096','--ws-max-queue','8','--ws-per-message-deflate','false','--log-level','info')
    $p=Start-Process -FilePath $python -ArgumentList $args -WorkingDirectory $backend -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs "$stamp-backend.out.log") -RedirectStandardError (Join-Path $logs "$stamp-backend.err.log")
    $created+=$p
    Write-Output "Waypoint + optional SDXL service starting, PID $($p.Id). Logs: $logs"
  } else {Write-Output 'Reusing existing backend; no model reload.'}
  $deadline=(Get-Date).AddMinutes(5)
  while (-not ($health -and $health.model_loaded)) {
    if ((Get-Date) -gt $deadline) {throw 'Model readiness timed out; inspect backend logs.'}
    foreach($p in $created){if($p.HasExited){throw 'Backend exited during startup; inspect logs.'}}
    Start-Sleep -Seconds 2
    $health=Health
    if($health.error){throw $health.error}
  }
  if ($health.model -ne 'Overworld/Waypoint-1.5-1B-360P' -or $health.quant -ne 'fp8w8a8') {throw 'Backend does not match the frozen FP8 model baseline.'}
  Invoke-RestMethod http://127.0.0.1:8000/scenes?limit=1 -TimeoutSec 5 | Out-Null
  if (-not (Get-NetTCPConnection -LocalPort 4821 -State Listen -ErrorAction SilentlyContinue)) {
    $node=(Get-Command node.exe).Source
    # Quote the absolute script path for Windows Start-Process argument parsing.
    $p=Start-Process -FilePath $node -ArgumentList @(('"'+$vite+'"'),'--host','127.0.0.1','--port','4821','--strictPort') -WorkingDirectory $frontend -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs "$stamp-react.out.log") -RedirectStandardError (Join-Path $logs "$stamp-react.err.log")
    $created+=$p
    $deadline=(Get-Date).AddSeconds(30)
    while ($true) {
      try {$r=Invoke-WebRequest http://127.0.0.1:4821/ -TimeoutSec 2; if($r.StatusCode -eq 200){break}} catch {}
      if ($p.HasExited -or (Get-Date) -gt $deadline) {throw 'React startup failed; inspect React logs.'}
      Start-Sleep -Milliseconds 500
    }
  } else {Write-Output 'Reusing frontend on4821; verify it is the patched Cursor checkout.'}
  # Confirm the served adapter uses the real session protocol, including reused servers.
  $adapter=(Invoke-WebRequest http://127.0.0.1:4821/src/services/engineConfig.ts -TimeoutSec 5).Content
  if ($adapter -notmatch '/world/stream\?session_id=') {throw 'Frontend on4821 is not compatible with the frozen backend.'}
  $created | Select-Object Id,ProcessName | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logs "$stamp-owned-processes.json")
  Write-Output 'Ready: http://127.0.0.1:4821/create'
  Write-Output 'SDXL loads lazily on Generate World. Stop active/paused worlds before generating. Saved-image fallback skips SDXL.'
  Write-Output 'Processes remain running. Use the recorded owned PIDs to stop only processes launched by this script.'
} catch {
  foreach($p in $created){if(-not $p.HasExited){Stop-Process -Id $p.Id}}
  throw
}
