# Ghi / xem tien do chay. Moi LUOT CHAY (run) co mot tep rieng: progress.<Run>.jsonl, luu trong thu muc
# logs\ (trong thu muc lam viec hien tai; tu tao neu chua co; doi bang -Dir). Moi dong = mot su kien, chi NOI THEM dong, khong viet lai ca tep.
# (Tep nay chi dung ky tu ASCII de Windows PowerShell 5.1 doc dung.)
#
# Ghi:     powershell -NoProfile -ExecutionPolicy Bypass -File progress.ps1 -Run "<run>" -Video 13A.1 -Status submitted -Seconds 10
# Xem:     powershell -NoProfile -ExecutionPolicy Bypass -File progress.ps1 -Run "<run>" -Show
# Liet ke: powershell -NoProfile -ExecutionPolicy Bypass -File progress.ps1 -List
#
# -Run : ten luot chay (vd. "American Cultural (1)__BA (2)" = ten Excel + ten sheet). Doi kich ban/tai lieu => doi -Run
#        => tep log moi => khong bi trung ten video voi lan chay truoc.
# Status hop le: submitting | submitted | downloaded | moved | failed | redo
#   submitting = sap bam gui (ghi TRUOC khi gui); submitted = da gui (MOI lan gui = ~1 luot credit)
#   downloaded = da bam tai; moved = file da nam trong videos/; failed = loi (kem -Note)
#   redo = can LAM LAI video nay (bat buoc kem -Note ly do); coi nhu chua lam khi chay lai
# Trang thai hien tai cua moi video = dong CUOI CUNG cua video do. Credit dem theo SO LAN 'submitted'.
param(
  [string]$Run = "",
  [string]$Video = "",
  [string]$Status = "",
  [string]$Seconds = "",
  [string]$Note = "",
  [string]$File = "",
  [switch]$Show,
  [switch]$List,
  [int]$CreditPerVideo = 15,   # fallback only, used when a 'submitted' event has no (or an unknown) -Seconds
  [string]$Dir = "",
  [string]$Path = ""
)

$utf8 = New-Object System.Text.UTF8Encoding($false)   # UTF-8 khong BOM

# Credit cost per submission, by duration in seconds (provided by the user: 4s=7, 6s=10, 8s=12, 10s=15).
$CreditBySeconds = @{ 4 = 7; 6 = 10; 8 = 12; 10 = 15 }
function Get-Credit($seconds) {
  if ($null -ne $seconds -and $CreditBySeconds.ContainsKey([int]$seconds)) { return [int]$CreditBySeconds[[int]$seconds] }
  return $null
}
if (-not $Dir) { $Dir = Join-Path (Get-Location).Path "logs" }   # thu muc log rieng, trong thu muc lam viec hien tai (noi co file Excel)

function Get-RunPath([string]$run) {
  # Thay ky tu cam trong ten file Windows bang '-'
  $safe = ($run -replace '[\\/:*?"<>|]', '-').Trim()
  return (Join-Path $Dir ("progress." + $safe + ".jsonl"))
}

function Read-Run([string]$p) {
  $last = [ordered]@{}
  $sends = @{}
  $credits = @{}
  $script:unknownCost = 0
  foreach ($line in [System.IO.File]::ReadAllLines($p, $utf8)) {
    if (-not $line.Trim()) { continue }
    try { $e = $line | ConvertFrom-Json } catch { continue }
    $last[$e.video] = $e
    if ($e.status -eq 'submitted') {
      $sends[$e.video] = 1 + [int]$sends[$e.video]
      $c = Get-Credit $e.seconds
      if ($null -eq $c) { $c = $CreditPerVideo; $script:unknownCost = 1 + [int]$script:unknownCost }
      $credits[$e.video] = $c + [int]$credits[$e.video]
    }
  }
  return @{ last = $last; sends = $sends; credits = $credits; unknown = [int]$script:unknownCost }
}

if ($List) {
  $files = @()
  if (Test-Path -LiteralPath $Dir) { $files = @(Get-ChildItem -LiteralPath $Dir -Filter "progress.*.jsonl" -ErrorAction SilentlyContinue) }
  if (-not $files.Count) { Write-Output "NO RUNS (no progress.*.jsonl in $Dir)."; exit 0 }
  foreach ($f in $files) {
    $r = Read-Run $f.FullName
    $n = ($r.sends.Values | Measure-Object -Sum).Sum
    $cr = ($r.credits.Values | Measure-Object -Sum).Sum
    Write-Output ("{0} | videos: {1} | submissions: {2} | credit: {3} | last write: {4}" -f $f.Name, $r.last.Count, [int]$n, [int]$cr, $f.LastWriteTime.ToString("s"))
  }
  exit 0
}

if (-not $Path) {
  if (-not $Run) { Write-Error "Missing -Run (run name). Use -List to see existing runs."; exit 1 }
  $Path = Get-RunPath $Run
}

if ($Show) {
  if (-not (Test-Path -LiteralPath $Path)) { Write-Output "NO PROGRESS for this run ($Path does not exist)."; exit 0 }
  $r = Read-Run $Path
  $rows = @($r.last.Values | ForEach-Object {
    [pscustomobject]@{ video = $_.video; status = $_.status; sends = [int]$r.sends[$_.video]; credit = [int]$r.credits[$_.video]; seconds = $_.seconds; t = $_.t; file = $_.file; note = $_.note }
  })
  ($rows | Format-Table -AutoSize | Out-String -Width 200).TrimEnd() | Write-Output
  $submissions = [int](($r.sends.Values | Measure-Object -Sum).Sum)   # EVERY submitted event = credit spent, redo included
  $creditTotal = [int](($r.credits.Values | Measure-Object -Sum).Sum)   # per submission, by duration: 4s=7, 6s=10, 8s=12, 10s=15
  $uncertain = @($rows | Where-Object { $_.status -eq 'submitting' }).Count
  $failed = @($rows | Where-Object { $_.status -eq 'failed' }).Count
  $redo = @($rows | Where-Object { $_.status -eq 'redo' }).Count
  Write-Output ("RUN {0} | TOTAL {1} video | submissions: {2} | CREDIT: {3}{7} | UNCERTAIN (submitting): {4} | failed: {5} | redo: {6}" -f $Run, $rows.Count, $submissions, $creditTotal, $uncertain, $failed, $redo, $(if ($r.unknown -gt 0) { " (incl. $($r.unknown) submission(s) with unknown duration counted at $CreditPerVideo)" } else { "" }))
  exit 0
}

$valid = @('submitting', 'submitted', 'downloaded', 'moved', 'failed', 'redo')
if (-not $Video -or $valid -notcontains $Status) { Write-Error ("Usage: -Run NAME -Video NAME -Status (" + ($valid -join '|') + ") or -Show / -List"); exit 1 }
if ($Status -eq 'redo' -and -not $Note) { Write-Error "Status 'redo' requires -Note (reason)."; exit 1 }

$ev = [ordered]@{ video = $Video; status = $Status; t = (Get-Date).ToUniversalTime().ToString("o") }
if ($Seconds) { $ev.seconds = [int]$Seconds }
if ($Note) { $ev.note = $Note }
if ($File) {
  $ev.file = $File
  if (Test-Path -LiteralPath $File) { $ev.bytes = (Get-Item -LiteralPath $File).Length }
}
$pd = Split-Path -Parent $Path
if ($pd -and -not (Test-Path -LiteralPath $pd)) { New-Item -ItemType Directory -Force -Path $pd | Out-Null }
[System.IO.File]::AppendAllText($Path, (($ev | ConvertTo-Json -Compress) + "`n"), $utf8)
Write-Output ("{0} -> {1}" -f $Video, $Status)
