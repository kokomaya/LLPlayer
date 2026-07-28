#requires -Version 5.1
<#
.SYNOPSIS
  Fetch an open-licensed demo clip + subtitles and copy them into the Aurora
  mobile app's PRIVATE on-device storage so the A4 subtitle features can be
  exercised on a real video.

.DESCRIPTION
  Everything this script downloads is Creative-Commons open cinema (the Blender
  Foundation open movies) — no keys, no accounts, nothing that could leak a
  credential (see rule ①.E: no API keys / tokens / model paths in the repo).
  It never writes anything secret and never phones home.

  Pipeline:
    1. Download <clip>.mp4 + a subtitle track into a local, gitignored staging
       dir (default: apps/mobile/.demo-assets, which is already ignored).
    2. (optional, -WhisperX) run WhisperX locally to produce a word-level
       <clip>.whisperx.json — this is what makes 逐词点跳 exact rather than
       interpolated. WhisperX + its model are YOUR local install; the model path
       is read from $env:WHISPERX_MODEL or defaults to a name WhisperX resolves
       itself. No model path is committed.
    3. Push both onto the device the RIGHT way: adb push to /data/local/tmp,
       then `run-as <pkg> cp` into files/ (debug builds only). A file pushed
       straight to /sdcard is owned by `shell` and the app gets EACCES — see the
       android-demo-media-run-as-copy note.

  The mobile app (App.tsx) then lists its files dir, picks the richest subtitle
  via pickBestSubtitle() (whisperx > whisper > ass > srt > vtt > lrc), and parses
  it with the real @aurora/subtitle registry.

.PARAMETER Clip
  Which open clip to fetch. Default: 'mdn' — a tiny (~0.8MB) CC video that ships
  a timing-MATCHED WebVTT track, so tap-to-seek lands on the right words with
  zero extra setup. 'sintel' is the larger Blender trailer but has no reliable
  caption sibling, so pair it with -WhisperX to get word-level timings.

.PARAMETER WhisperX
  Also transcribe the clip to a word-level <clip>.whisperx.json using a local
  WhisperX install (must be on PATH). Off by default.

.PARAMETER Package
  Android application id. Default: com.anonymous.auroramobile.

.PARAMETER Push
  Copy the staged files onto a connected device via adb + run-as. Off by
  default so you can stage first and inspect.

.PARAMETER StageDir
  Where downloads land. Default: <repo>/apps/mobile/.demo-assets (gitignored).

.EXAMPLE
  ./fetch-demo-media.ps1 -Push
  # download the tiny MDN clip + its timing-matched VTT, copy both into files/.

.EXAMPLE
  ./fetch-demo-media.ps1 -Clip sintel -WhisperX -Push
  # cinematic trailer, transcribe word-level JSON locally, then push.
#>
[CmdletBinding()]
param(
  [ValidateSet('mdn', 'sintel')]
  [string]$Clip = 'mdn',
  [switch]$WhisperX,
  [string]$Package = 'com.anonymous.auroramobile',
  [switch]$Push,
  [string]$StageDir
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# --- Catalogue of open, CC-licensed clips -----------------------------------
# Only public, license-clean URLs. No auth, no cookies, no tokens.
$mdnMedia = 'https://raw.githubusercontent.com/mdn/learning-area/main/html/multimedia-and-embedding/tasks/media-embed/media'
$Catalog = @{
  # Tiny CC clip whose WebVTT cues line up with the picture — best zero-setup
  # demo of tap-to-seek because a tapped word actually lands on its moment.
  'mdn' = @{
    Video = "$mdnMedia/video.mp4"
    Subtitle = "$mdnMedia/subtitles_en.vtt"
    SubExt = '.vtt'
  }
  # Blender's Sintel trailer — cinematic, but no license-clean caption sibling
  # we can rely on. Fetch it with -WhisperX to transcribe word-level timings.
  'sintel' = @{
    Video = 'https://media.w3.org/2010/05/sintel/trailer.mp4'
    Subtitle = $null
    SubExt = $null
  }
}

function Resolve-StageDir {
  param([string]$Explicit)
  if ($Explicit) { return $Explicit }
  # This script lives in apps/mobile/scripts; stage next to it under the app.
  $appRoot = Split-Path -Parent $PSScriptRoot
  return Join-Path $appRoot '.demo-assets'
}

function Save-File {
  param([string]$Url, [string]$Dest)
  Write-Host "  ↓ $Url" -ForegroundColor DarkCyan
  # Invoke-WebRequest respects the machine proxy; -UseBasicParsing keeps it
  # dependency-free. No credentials are ever attached.
  Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing
  $size = [math]::Round((Get-Item $Dest).Length / 1MB, 2)
  Write-Host "    → $Dest ($size MB)" -ForegroundColor DarkGray
}

function Invoke-WhisperX {
  param([string]$VideoPath, [string]$OutJson)
  $whisperx = Get-Command whisperx -ErrorAction SilentlyContinue
  if (-not $whisperx) {
    throw "WhisperX not found on PATH. Install it (pip install whisperx) or drop the -WhisperX flag."
  }
  # Model comes from your env, never the repo. WhisperX resolves a default if unset.
  $model = if ($env:WHISPERX_MODEL) { $env:WHISPERX_MODEL } else { 'small' }
  $outDir = Split-Path -Parent $OutJson
  Write-Host "  ⚙  whisperx (model=$model) — this can take a while…" -ForegroundColor DarkCyan
  & $whisperx.Source $VideoPath --model $model --output_format json --output_dir $outDir
  # WhisperX names its output <clipbase>.json; rename to the .whisperx.json the
  # picker ranks highest.
  $base = [IO.Path]::GetFileNameWithoutExtension($VideoPath)
  $produced = Join-Path $outDir "$base.json"
  if (Test-Path $produced) {
    Move-Item -Force $produced $OutJson
    Write-Host "    → $OutJson" -ForegroundColor DarkGray
  } else {
    Write-Warning "WhisperX finished but $produced was not found; check its output."
  }
}

function Push-ToDevice {
  param([string]$LocalPath, [string]$Package)
  $adb = Get-Command adb -ErrorAction SilentlyContinue
  if (-not $adb) { throw "adb not found on PATH (install platform-tools)." }
  $name = Split-Path -Leaf $LocalPath
  $tmp = "/data/local/tmp/$name"
  Write-Host "  → device: $name" -ForegroundColor DarkCyan
  & $adb.Source push $LocalPath $tmp | Out-Null
  # Copy AS THE APP so the app owns it (avoids scoped-storage EACCES).
  & $adb.Source shell "run-as $Package cp $tmp files/$name"
  & $adb.Source shell "rm $tmp" | Out-Null
}

# --- Run --------------------------------------------------------------------
$entry = $Catalog[$Clip]
$dir = Resolve-StageDir -Explicit $StageDir
New-Item -ItemType Directory -Force -Path $dir | Out-Null

Write-Host "Aurora demo media · clip=$Clip · stage=$dir" -ForegroundColor Green

# The app plays files/sintel.mp4 (see App.tsx DEMO_MEDIA); keep the base name
# stable as the clip id so the picker/candidate names line up.
$videoName = "$Clip.mp4"
$videoPath = Join-Path $dir $videoName
Save-File -Url $entry.Video -Dest $videoPath

$staged = @($videoPath)

if ($entry.Subtitle) {
  $subName = "$Clip$($entry.SubExt)"
  $subPath = Join-Path $dir $subName
  Save-File -Url $entry.Subtitle -Dest $subPath
  $staged += $subPath
} else {
  Write-Host "  (no bundled subtitle for $Clip — use -WhisperX to generate one)" -ForegroundColor Yellow
}

if ($WhisperX) {
  $jsonPath = Join-Path $dir "$Clip.whisperx.json"
  Invoke-WhisperX -VideoPath $videoPath -OutJson $jsonPath
  if (Test-Path $jsonPath) { $staged += $jsonPath }
}

if ($Push) {
  Write-Host "Pushing to device (package=$Package)…" -ForegroundColor Green
  foreach ($f in $staged) { Push-ToDevice -LocalPath $f -Package $Package }
  Write-Host "Done. Reload the app — it will list files/ and pick the richest subtitle." -ForegroundColor Green
} else {
  Write-Host "Staged (not pushed). Re-run with -Push to copy onto a device:" -ForegroundColor Green
  $staged | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
}
