param([string]$Python='C:\Users\filma\Documents\Morph\Codex Plus\.venv\Scripts\python.exe',[switch]$Restart)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$env:HF_HUB_OFFLINE='1'
$env:WORLDSHIFT_EXPERIMENT_MODEL='Overworld/Waypoint-1.5-1B'
$env:WORLDSHIFT_ORIGINS='http://localhost:3000,http://127.0.0.1:3000,http://127.0.0.1:4834'
$taskListener=Get-NetTCPConnection -State Listen -LocalPort 8002 -ErrorAction SilentlyContinue
if($taskListener){
  if(-not $Restart){throw 'Port8002 occupied; inspect before restarting.'}
  $taskHealth=Invoke-RestMethod http://127.0.0.1:8002/health
  if($taskHealth.status -ne 'ready'){throw 'Stop the current world before restarting the owned native720 service.'}
  $taskProc=Get-CimInstance Win32_Process -Filter "ProcessId=$($taskListener.OwningProcess)"
  $taskOwners=@('backend.pid','recovery.pid') | ForEach-Object { $taskPidFile=Join-Path $PSScriptRoot $_; if(Test-Path -LiteralPath $taskPidFile){[int](Get-Content -LiteralPath $taskPidFile)} }
  if($taskProc.ParentProcessId -notin $taskOwners -or $taskProc.CommandLine -notmatch 'worldshift\.(memory_service|recovery_experiment):app.*--port 8002'){throw '8002 is not an owned native720 process; refusing to stop it.'}
  $taskOwned=Get-Process -Id $taskProc.ProcessId
  Stop-Process -Id $taskProc.ProcessId
  $taskOwned.WaitForExit(10000) | Out-Null
  if(Get-NetTCPConnection -State Listen -LocalPort 8002 -ErrorAction SilentlyContinue){throw 'Owned process has not released8002.'}
}
$taskBackend=Start-Process -WindowStyle Hidden -FilePath $Python -ArgumentList @('-m','uvicorn','worldshift.memory_service:app','--host','127.0.0.1','--port','8002','--workers','1','--ws-per-message-deflate','false') -WorkingDirectory "$PSScriptRoot\backend" -RedirectStandardOutput "$PSScriptRoot\native720.log" -RedirectStandardError "$PSScriptRoot\native720.err" -PassThru
$taskBackend.Id | Set-Content "$PSScriptRoot\backend.pid"
if(-not(Get-NetTCPConnection -State Listen -LocalPort 4834 -ErrorAction SilentlyContinue)){
  $taskFrontend=Start-Process -WindowStyle Hidden -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList @('node_modules/vite/bin/vite.js','--config','vite.native720.config.mjs') -WorkingDirectory $taskRoot -RedirectStandardOutput "$PSScriptRoot\frontend.log" -RedirectStandardError "$PSScriptRoot\frontend.err" -PassThru
  $taskFrontend.Id | Set-Content "$PSScriptRoot\frontend.pid"
}
Write-Output 'Native720 frontend http://127.0.0.1:4834 ; backend http://127.0.0.1:8002/health. Archive8000/4821 is not the product entry point.'
