param(
  [string]$List,          # UTF-8 text file: each line "id<TAB>text"
  [string]$OutDir,        # wav files are written here as <id>.wav
  [string]$Voice = 'Yating',
  [double]$Rate = 1.0
)
# Windows built-in speech (OneCore voices: Yating / Hanhan / Zhiwei), no internet needed.
# Kept ASCII-only on purpose (PowerShell 5.1 reads scripts without BOM as ANSI).
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait() | Out-Null; $task.Result }

$s = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$v = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -like "*$Voice*" } | Select-Object -First 1
if (-not $v) { Write-Output "voice not found: $Voice"; exit 1 }
$s.Voice = $v
$s.Options.SpeakingRate = $Rate
New-Item -ItemType Directory -Force $OutDir | Out-Null

$lines = [IO.File]::ReadAllLines($List, [Text.Encoding]::UTF8)
$done = 0
foreach ($line in $lines) {
  $tab = $line.IndexOf("`t"); if ($tab -lt 1) { continue }
  $id = $line.Substring(0, $tab); $text = $line.Substring($tab + 1)
  $out = Join-Path $OutDir "$id.wav"
  if (Test-Path $out) { continue }
  try {
    $stream = Await ($s.SynthesizeTextToStreamAsync($text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
    $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
    $n = [uint32]$stream.Size
    $null = Await ($reader.LoadAsync($n)) ([uint32])
    $bytes = New-Object byte[] $n; $reader.ReadBytes($bytes)
    [IO.File]::WriteAllBytes($out, $bytes)
    $done++
    if ($done % 200 -eq 0) { Write-Output "done $done" }
  } catch { Write-Output "fail $id $($_.Exception.Message)" }
}
Write-Output "finished $done"
