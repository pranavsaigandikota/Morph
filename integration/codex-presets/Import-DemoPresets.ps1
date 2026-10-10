param(
  [string]$BackendRoot = 'C:\Users\filma\Documents\Morph\Codex Plus',
  [string]$PresetDirectory = (Join-Path $PSScriptRoot 'presets'),
  [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$resolvedRoot = (Resolve-Path -LiteralPath $BackendRoot).Path
$store = Join-Path $resolvedRoot 'saved_scenes'
$presets = Get-Content -LiteralPath (Join-Path $PresetDirectory 'manifest.json') -Raw | ConvertFrom-Json
foreach ($scene in $presets) {
  if ($scene.scene_id -notmatch '^[0-9a-f]{32}$' -or $scene.preset_name -notmatch '^[a-z-]+$') { throw 'Invalid preset manifest ID' }
  $source = Join-Path $PresetDirectory ($scene.preset_name + '.png')
  if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $scene.image_sha256) { throw "Preset hash mismatch: $source" }
  $folder = Join-Path $store $scene.scene_id
  $image = Join-Path $folder 'seed.png'
  if (Test-Path -LiteralPath $image) {
    if ((Get-FileHash -LiteralPath $image -Algorithm SHA256).Hash.ToLowerInvariant() -ne $scene.image_sha256) { throw "Existing scene differs: $image" }
  }
  if (-not $CheckOnly) {
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
    if (-not (Test-Path -LiteralPath $image)) { Copy-Item -LiteralPath $source -Destination $image }
    $scene.world_start_request.seed_image_path = $image
    $metadataPath = Join-Path $folder 'scene.json'
    # Existing scenes remain byte-preserved; only new imports need metadata.
    if (-not (Test-Path -LiteralPath $metadataPath)) {
      $json = $scene | ConvertTo-Json -Depth 12
      [System.IO.File]::WriteAllText($metadataPath, $json, [System.Text.UTF8Encoding]::new($false))
    }
  }
  Write-Output "$($scene.preset_name): verified $($scene.scene_id)"
}
