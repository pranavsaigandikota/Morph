<#
.SYNOPSIS
  Generate a deterministic HQ SDXL contact sheet via the experimental scene API.

.DESCRIPTION
  Targets native 1280x720, ~30 steps, quality high, first-person composition guide.
  Does NOT fall back to verified Turbo (steps<=4) and label it HQ.
  Requires Codex experimental backend on http://127.0.0.1:8000.
  Cloud agents cannot run this against a real GPU — use Windows.

.EXAMPLE
  .\scripts\Generate-HqStarterContactSheet.ps1 -Prompt "Rain-soaked neon alley..." -Style cinematic
#>
param(
  [Parameter(Mandatory = $true)][string]$Prompt,
  [ValidateSet('cinematic', 'photorealistic', 'fantasy', 'stylized')]
  [string]$Style = 'cinematic',
  [string]$ApiBase = 'http://127.0.0.1:8000',
  [int[]]$Seeds = @(202610101, 202610102, 202610103, 202610104, 202610105, 202610106),
  [int]$Steps = 30,
  [int]$Width = 1280,
  [int]$Height = 720,
  [string]$OutDir = ''
)

$ErrorActionPreference = 'Stop'

if (-not $OutDir) {
  $OutDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'work\hq-starters'
}
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$guide = 'first-person eye-level view, clear forward depth, recognizable buildings or natural structures, sensible architecture, open path ahead when appropriate, coherent lighting, detailed materials, no abstract blobs, no distorted geometry'
$effective = if ($Prompt -match 'first[- ]person') {
  ("{0}, {1}" -f $Prompt.Trim(), $guide).Substring(0, [Math]::Min(500, ("{0}, {1}" -f $Prompt.Trim(), $guide).Length))
} else {
  ("{0}. {1}" -f $Prompt.Trim(), $guide).Substring(0, [Math]::Min(500, ("{0}. {1}" -f $Prompt.Trim(), $guide).Length))
}

Write-Host "API: $ApiBase"
Write-Host "Effective prompt ($($effective.Length) chars): $effective"
Write-Host "Target: ${Width}x${Height}, steps=$Steps, quality=high, seeds=$($Seeds -join ',')"

try {
  $health = Invoke-RestMethod -Uri "$ApiBase/healthz" -TimeoutSec 5
} catch {
  try { $health = Invoke-RestMethod -Uri "$ApiBase/health" -TimeoutSec 5 } catch {
    throw "Backend not reachable at $ApiBase. Start Codex on port 8000 first. Do not invent images."
  }
}
Write-Host "Health ok: $($health | ConvertTo-Json -Compress)"

$manifest = [ordered]@{
  created_at_utc = (Get-Date).ToUniversalTime().ToString('o')
  api_base       = $ApiBase
  user_prompt    = $Prompt
  effective_prompt = $effective
  style          = $Style
  width          = $Width
  height         = $Height
  steps          = $Steps
  quality        = 'high'
  candidates     = @()
  errors         = @()
  policy         = @{
    early_waypoint_recovery_anchor = 'rejected'
    turbo_as_hq                    = 'forbidden'
  }
}

foreach ($seed in $Seeds) {
  Write-Host "`n=== Seed $seed ===" -ForegroundColor Cyan
  $body = @{
    prompt      = $effective
    style       = $Style
    seed        = $seed
    steps       = $Steps
    perspective = 'first_person'
    quality     = 'high'
    width       = $Width
    height      = $Height
  } | ConvertTo-Json -Compress

  try {
    $submitted = Invoke-RestMethod -Method Post -Uri "$ApiBase/scenes/generate" `
      -ContentType 'application/json' -Body $body -TimeoutSec 30
  } catch {
    $msg = $_.Exception.Message
    Write-Warning "HQ generate rejected for seed $seed : $msg"
    if ($msg -match '422|steps|quality|validation') {
      Write-Warning 'Experimental HIGH API unavailable. Will NOT silently use Turbo as HQ.'
    }
    $manifest.errors += @{ seed = $seed; message = $msg }
    continue
  }

  $pollUrl = if ($submitted.poll_url -match '^https?://') { $submitted.poll_url } else { "$ApiBase$($submitted.poll_url)" }
  $job = $null
  for ($i = 0; $i -lt 600; $i++) {
    Start-Sleep -Milliseconds 500
    $job = Invoke-RestMethod -Uri $pollUrl -TimeoutSec 30
    if ($job.status -eq 'error') { throw "Seed $seed job error: $($job.error)" }
    if ($job.status -eq 'ready') { break }
    Write-Host ("  {0} {1}/{2}" -f $job.phase, $job.step, $job.total_steps)
  }
  if (-not $job -or $job.status -ne 'ready') { throw "Seed $seed timed out" }

  $meta = $job.metadata
  $gotSteps = [int]$meta.steps
  if ($gotSteps -le 4) {
    throw "Seed $seed returned Turbo-class steps=$gotSteps — refusing to label as HQ."
  }

  $imageRel = [string]$meta.image_url
  $imageUrl = if ($imageRel -match '^https?://') { $imageRel } else { "$ApiBase$imageRel" }
  $pngPath = Join-Path $OutDir ("hq_seed_{0}.png" -f $seed)
  Invoke-WebRequest -Uri $imageUrl -OutFile $pngPath -TimeoutSec 60

  $sha = [string]$meta.image_sha256
  if (-not $sha -and (Test-Path $pngPath)) {
    $bytes = [System.IO.File]::ReadAllBytes($pngPath)
    $sha = -join (([System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)) | ForEach-Object { $_.ToString('x2') })
  }

  $entry = [ordered]@{
    seed           = $seed
    scene_id       = $meta.scene_id
    steps          = $gotSteps
    width          = $meta.output_dimensions.width
    height         = $meta.output_dimensions.height
    model          = $meta.model
    revision       = $meta.revision
    image_sha256   = $sha
    image_url      = $imageUrl
    local_png      = $pngPath
    approval       = 'pending'
    world_start_request = $meta.world_start_request
  }
  $manifest.candidates += $entry
  Write-Host ("  Ready SHA={0} scene={1}" -f $sha, $meta.scene_id) -ForegroundColor Green
}

$manifestPath = Join-Path $OutDir 'contact_sheet_manifest.json'
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-Host "`nManifest: $manifestPath"
Write-Host "Candidates: $($manifest.candidates.Count)  Errors: $($manifest.errors.Count)"
Write-Host 'Open PNGs + Create UI contact sheet for human approval before Waypoint.'
if ($manifest.candidates.Count -eq 0) { exit 2 }
exit 0
