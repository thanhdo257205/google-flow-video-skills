# Background mover for queue mode: watches Downloads and moves each finished video into
#   <Root>\videos\<Scenario>\<name>.mp4   (Scenario = column A, from <Root>\scenes.json)
# and writes `downloaded` + `moved` to the sheet's own log (<Root>\logs\progress.<Run>.jsonl).
#
# usage (start hidden, ONE per sheet, stop it when the sheet is done):
#   powershell -NoProfile -ExecutionPolicy Bypass -File mover_daemon.ps1 -Root "<...>\Dev" -Since "2026-10-06T11:13:00Z" -Run "American Cultural (4)__Dev"
#   Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','mover_daemon.ps1','-Root','<...>\Dev','-Since','<UTC ISO>','-Run','"American Cultural (4)__Dev"'
#   NOTE the extra double quotes around -Run when the run name has spaces.
#
# Notes (learned in practice):
# - Flow saves files as "<name>_<yyyyMMddHHmmss>.mp4" (e.g. 4.1D_20261006181720.mp4); the suffix (and Chrome's " (1)") is stripped here.
# - Only files newer than -Since are touched. An existing destination is kept in _cu\ (never overwritten).
# - Progress is written with -Dir <Root>\logs so it never lands in the wrong folder (progress.ps1 defaults to .\logs of the CURRENT dir).
# - Stop with: Get-CimInstance Win32_Process | ? { $_.CommandLine -like '*mover_daemon*' } | % { Stop-Process -Id $_.ProcessId -Force }
param(
  [Parameter(Mandatory=$true)][string]$Root,
  [Parameter(Mandatory=$true)][string]$Since,
  [Parameter(Mandatory=$true)][string]$Run,
  [string]$Downloads = "$env:USERPROFILE\Downloads",
  [int]$PollSeconds = 5
)
$P = Join-Path $PSScriptRoot "progress.ps1"
$st = [datetime]::Parse($Since).ToUniversalTime()
$logs = Join-Path $Root "logs"; New-Item -ItemType Directory -Force -Path $logs | Out-Null
$scenes = Get-Content (Join-Path $Root "scenes.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$map = @{}; foreach ($s in $scenes) { $map[[string]$s.name] = [string]$s.scenario }
while ($true) {
  foreach ($f in Get-ChildItem $Downloads -Filter *.mp4 -ErrorAction SilentlyContinue) {
    if ($f.LastWriteTimeUtc -le $st) { continue }
    $base = [IO.Path]::GetFileNameWithoutExtension($f.Name) -replace '(_\d{14})?( \(\d+\))?$', ''
    if (-not $map.ContainsKey($base)) { continue }
    $bad = [IO.Path]::GetInvalidFileNameChars() -join ''
    $scn = ($map[$base] -replace "[$([regex]::Escape($bad))]", '-')
    $dir = Join-Path $Root ("videos\" + $scn); New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $dest = Join-Path $dir "$base.mp4"
    if (Test-Path -LiteralPath $dest) {
      $old = Join-Path $dir "_cu"; New-Item -ItemType Directory -Force -Path $old | Out-Null
      Move-Item -LiteralPath $dest (Join-Path $old ("${base}_" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".mp4"))
    }
    try { Move-Item -LiteralPath $f.FullName $dest -ErrorAction Stop } catch { continue }   # still being written -> retry next poll
    & powershell -NoProfile -ExecutionPolicy Bypass -File $P -Run $Run -Video $base -Status downloaded -Dir $logs | Out-Null
    & powershell -NoProfile -ExecutionPolicy Bypass -File $P -Run $Run -Video $base -Status moved -File $dest -Dir $logs | Out-Null
    Add-Content (Join-Path $logs "mover.log") ("{0} moved {1}" -f (Get-Date -Format s), $dest)
  }
  Start-Sleep $PollSeconds
}
