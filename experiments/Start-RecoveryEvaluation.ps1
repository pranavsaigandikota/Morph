param([switch]$Restart)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskListener=Get-NetTCPConnection -State Listen -LocalPort 8002 -ErrorAction SilentlyContinue
if($taskListener){
    if(-not $Restart){throw '8002 occupied. Do not overwrite an existing server.'}
    $taskHealth=Invoke-RestMethod http://127.0.0.1:8002/health
    if($taskHealth.status -ne 'ready'){throw 'Only switch after the experimental world stops and health is ready.'}
    $taskProc=Get-CimInstance Win32_Process -Filter "ProcessId=$($taskListener.OwningProcess)"
    $taskParent=[int](Get-Content -LiteralPath "$PSScriptRoot\recovery.pid")
    if($taskProc.ParentProcessId -ne $taskParent -or $taskProc.CommandLine -notlike '*worldshift.recovery_experiment:app*--port 8002*'){throw 'Listener is not our owned experiment process.'}
    $taskOwned=Get-Process -Id $taskProc.ProcessId
    Stop-Process -Id $taskProc.ProcessId
    $taskOwned.WaitForExit(10000) | Out-Null
    for($i=0;$i -lt 30 -and (Get-NetTCPConnection -State Listen -LocalPort 8002 -ErrorAction SilentlyContinue);$i++){Start-Sleep -Milliseconds 100}
}
$env:HF_HUB_OFFLINE='1'
$env:WORLDSHIFT_EXPERIMENT_MODEL='Overworld/Waypoint-1.5-1B'
$env:WORLDSHIFT_EXPERIMENT_REFERENCES='C:\Users\filma\Documents\Codex\2026-10-10\wo\outputs\recovery-evaluation\approved-references.json'
$env:WORLDSHIFT_ORIGINS='http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:4835'
$taskServer=Start-Process -WindowStyle Hidden -FilePath 'C:\Users\filma\Documents\Morph\Codex Plus\.venv\Scripts\python.exe' -ArgumentList @('-m','uvicorn','worldshift.recovery_experiment:app','--host','127.0.0.1','--port','8002','--workers','1','--ws-per-message-deflate','false') -WorkingDirectory "$PSScriptRoot\backend" -RedirectStandardOutput "$PSScriptRoot\recovery-720.log" -RedirectStandardError "$PSScriptRoot\recovery-720.err" -PassThru
$taskServer.Id | Set-Content "$PSScriptRoot\recovery.pid"
if(-not(Get-NetTCPConnection -State Listen -LocalPort 4835 -ErrorAction SilentlyContinue)){
    $taskWeb=Start-Process -WindowStyle Hidden -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList @('node_modules/vite/bin/vite.js','--config','vite.recovery-evaluation.config.mjs') -WorkingDirectory $taskRoot -RedirectStandardOutput "$PSScriptRoot\recovery-web.log" -RedirectStandardError "$PSScriptRoot\recovery-web.err" -PassThru
    $taskWeb.Id | Set-Content "$PSScriptRoot\recovery-web.pid"
}
Write-Output 'Native 720P only: http://127.0.0.1:4835/quality-recovery.html. Wait for backend8002 health ready. Archival production8000 untouched.'
