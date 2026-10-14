# SchoolQ Voice Engine setup - the optional add-on that lets the server generate
# recorded-voice clips (Sarah, VoiceTut-TTS) in advance. Downloads ~5 GB once.
#
#   powershell -ExecutionPolicy Bypass -File install-engine.ps1
#     [-EngineDir C:\ProgramData\SchoolQ\VoiceEngine]
#     [-TorchWheel <file.whl>] [-TorchaudioWheel <file.whl>] [-ModelSource <folder>]   (reuse local copies)
#     [-NoPause]
param(
  [string]$EngineDir = (Join-Path $env:ProgramData 'SchoolQ\VoiceEngine'),
  [string]$TorchWheel,
  [string]$TorchaudioWheel,
  [string]$ModelSource,
  [switch]$NoPause
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Pinned versions - the combination SchoolQ was tested with
$UvVersion   = '0.8.22'
$TorchVer    = '2.7.1'
$OmniVoice   = 'https://github.com/k2-fsa/OmniVoice/archive/08be0b4ccbac3e13e374e86fbfead4b4cac343e2.zip'
$VoiceTut    = 'voicetut-tts==0.1.1'
$ModelRepo   = 'mohammedaly22/VoiceTut-TTS'
$ModelSha256 = '172ac1268fa98cb6253deb9f66fce1115e74e9b66012847b8483addad07a2b78'
$Skip        = '^(optimizer\.bin|scheduler.*|rng_state.*|random_states.*|trainer_state.*|.*\.pt)$'   # training-only files

function Step($n, $text) { Write-Host "`n[$n/7] $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host "`nSETUP FAILED: $text" -ForegroundColor Red; if (-not $NoPause) { Read-Host 'Press Enter to close' }; exit 1 }

# Resumable download (curl.exe ships with Windows 10+) with optional SHA-256 check
function Get-File($url, $dest, $sha256) {
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  if ($sha256 -and (Test-Path $dest) -and ((Get-FileHash $dest -Algorithm SHA256).Hash -ieq $sha256)) { return }
  for ($i = 1; $i -le 30; $i++) {
    & curl.exe -L -C - --fail --retry 5 --retry-delay 5 --speed-limit 20000 --speed-time 60 -# -o $dest $url
    if ($LASTEXITCODE -eq 0) { break }
    Write-Host "  connection dropped - resuming (attempt $i)" -ForegroundColor Yellow
    Start-Sleep 3
  }
  if ($LASTEXITCODE -ne 0) { Fail "could not download $url" }
  if ($sha256 -and ((Get-FileHash $dest -Algorithm SHA256).Hash -ine $sha256)) { Remove-Item $dest; Fail "checksum mismatch for $(Split-Path $dest -Leaf)" }
}

# Finds a wheel (URL + SHA-256) on a PyTorch package index page
function Find-Wheel($index, $name, $version, $flavor) {
  $html = (Invoke-WebRequest "$index/$name/" -UseBasicParsing).Content
  $pattern = "$name-$version%2B$flavor-cp310-cp310-win_amd64\.whl#sha256=([0-9a-f]{64})"
  $m = [regex]::Match($html, $pattern)
  if (-not $m.Success) { Fail "no $name $version ($flavor) wheel found on $index" }
  @{ Url = "$index/$($m.Value.Split('#')[0])"; Sha = $m.Groups[1].Value; File = [uri]::UnescapeDataString($m.Value.Split('#')[0]) }
}

Write-Host 'SchoolQ Voice Engine setup' -ForegroundColor Green
Write-Host "Installing to $EngineDir"

Step 1 'Checking this PC'
$drive = Get-PSDrive ((Split-Path $EngineDir -Qualifier).TrimEnd(':'))
if ($drive.Free -lt 8GB) { Fail ("needs 8 GB free on {0}: (has {1:N1} GB)" -f $drive.Name, ($drive.Free / 1GB)) }
$gpu = $null
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) { $gpu = (& nvidia-smi --query-gpu=name --format=csv,noheader 2>$null | Select-Object -First 1) }
$flavor = if ($gpu) { 'cu126' } else { 'cpu' }
Write-Host ("  {0}" -f $(if ($gpu) { "NVIDIA GPU: $gpu - fast generation (~1 min per phrase)" } else { 'No NVIDIA GPU - CPU generation works but is slow (several minutes per phrase)' }))

Step 2 'Installing a private Python (nothing system-wide)'
$env:UV_CACHE_DIR = Join-Path $EngineDir 'cache'
$env:UV_PYTHON_INSTALL_DIR = Join-Path $EngineDir 'python'
$env:UV_HTTP_TIMEOUT = '600'
$uv = Join-Path $EngineDir 'uv\uv.exe'
if (-not (Test-Path $uv)) {
  $zip = Join-Path $EngineDir 'downloads\uv.zip'
  Get-File "https://github.com/astral-sh/uv/releases/download/$UvVersion/uv-x86_64-pc-windows-msvc.zip" $zip
  Expand-Archive $zip (Join-Path $EngineDir 'uv') -Force
}
$venv = Join-Path $EngineDir 'venv'
$py = Join-Path $venv 'Scripts\python.exe'
if (-not (Test-Path $py)) { & $uv venv --python 3.10 $venv; if ($LASTEXITCODE) { Fail 'could not create the Python environment' } }

Step 3 "Downloading PyTorch $TorchVer ($flavor) - the largest download"
$index = "https://download.pytorch.org/whl/$flavor"
$wheels = @()
foreach ($pkg in @(@{ Name = 'torch'; Local = $TorchWheel }, @{ Name = 'torchaudio'; Local = $TorchaudioWheel })) {
  if ($pkg.Local) { $wheels += $pkg.Local; continue }
  $w = Find-Wheel $index $pkg.Name $TorchVer $flavor
  $dest = Join-Path $EngineDir "downloads\$($w.File)"
  Get-File $w.Url $dest $w.Sha
  $wheels += $dest
}

Step 4 'Installing the voice engine packages'
& $uv pip install --python $py @wheels $OmniVoice $VoiceTut soundfile numpy
if ($LASTEXITCODE) { Fail 'package install failed' }

Step 5 'Downloading the voice model (2.3 GB)'
$model = Join-Path $EngineDir 'model'
New-Item -ItemType Directory -Force $model | Out-Null
if ($ModelSource) {
  Copy-Item (Join-Path $ModelSource '*') $model -Recurse -Force -Exclude 'optimizer.bin', '.cache'
} else {
  $tree = Invoke-RestMethod "https://huggingface.co/api/models/$ModelRepo/tree/main?recursive=true"
  foreach ($f in $tree | Where-Object { $_.type -eq 'file' -and (Split-Path $_.path -Leaf) -notmatch $Skip }) {
    $sha = if ($f.path -eq 'model.safetensors') { $ModelSha256 } else { $null }
    Get-File "https://huggingface.co/$ModelRepo/resolve/main/$($f.path)" (Join-Path $model $f.path) $sha
  }
}
if ((Get-FileHash (Join-Path $model 'model.safetensors') -Algorithm SHA256).Hash -ine $ModelSha256) { Fail 'model file is incomplete or corrupt' }

Step 6 'Loading the model once to finish setup (takes a few minutes)'
$env:HF_HOME = Join-Path $EngineDir 'hf-cache'
$env:PYTHONIOENCODING = 'utf-8'
& $py -c "import sys; sys.path.insert(0, r'$PSScriptRoot'); from voicegen import load_engine; t, d = load_engine(r'$model'); print('model OK on', d)"
if ($LASTEXITCODE) { Fail 'the model did not load - see the messages above' }

Step 7 'Done'
Write-Host "`nVoice engine installed. In SchoolQ open Admin -> Voice Recordings and click 'Generate all missing'." -ForegroundColor Green
if (-not $NoPause) { Read-Host 'Press Enter to close' }
