param([string]$Python='C:\Users\filma\Documents\Morph\Codex Plus\.venv\Scripts\python.exe')
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$env:HF_HUB_OFFLINE='1'
$env:WORLDSHIFT_ORIGINS='http://localhost:3000,http://127.0.0.1:3000,http://127.0.0.1:4834'
if(Get-NetTCPConnection -State Listen -LocalPort 8002 -ErrorAction SilentlyContinue){throw 'Port8002 occupied; inspect before restarting.'}
$taskBackend=Start-Process -WindowStyle Hidden -FilePath $Python -ArgumentList @('-m','uvicorn','worldshift.memory_service:app','--host','127.0.0.1','--port','8002','--workers','1','--ws-per-message-deflate','false') -WorkingDirectory "$PSScriptRoot\backend" -RedirectStandardOutput "$PSScriptRoot\native720.log" -RedirectStandardError "$PSScriptRoot\native720.err" -PassThru
$taskBackend.Id | Set-Content "$PSScriptRoot\backend.pid"
if(-not(Get-NetTCPConnection -State Listen -LocalPort 4834 -ErrorAction SilentlyContinue)){
  $taskFrontend=Start-Process -WindowStyle Hidden -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList @('node_modules/vite/bin/vite.js','--config','vite.native720.config.mjs') -WorkingDirectory $taskRoot -RedirectStandardOutput "$PSScriptRoot\frontend.log" -RedirectStandardError "$PSScriptRoot\frontend.err" -PassThru
  $taskFrontend.Id | Set-Content "$PSScriptRoot\frontend.pid"
}
Write-Output 'Isolated720P frontend http://127.0.0.1:4834 ; backend http://127.0.0.1:8002/health. Existing8000/4821 untouched.'
