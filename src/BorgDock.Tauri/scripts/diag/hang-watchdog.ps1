# Hang watchdog for the installed BorgDock (borgdock.exe).
#
# Watches for two symptoms and captures diagnostics when either shows up:
#   1. the main window stops answering messages (Process.Responding = false)
#   2. %APPDATA%\BorgDock\logs\borgdock.log stops growing while the process is
#      alive (the GitHub poll cycle logs every ~65 s through IPC, so a stale
#      log means the main thread / IPC is stuck even if the window is hidden)
#
# On trigger it attaches cdb non-invasively, writes every thread's stack and
# the loaded-module list to logs\hang-<timestamp>.txt and a full minidump to
# logs\hang-<timestamp>.dmp, then keeps watching. The process is not killed.
#
# Usage (PowerShell, leave it running in a terminal):
#   pwsh -File scripts/diag/hang-watchdog.ps1
#   pwsh -File scripts/diag/hang-watchdog.ps1 -ProcessName notepad -StaleLogSeconds 0   # dry run on another process
param(
    [string]$ProcessName = 'borgdock',
    [int]$StaleLogSeconds = 240,
    [int]$UnresponsiveChecks = 3,
    [int]$IntervalSeconds = 2,
    [string]$Cdb = 'C:\Program Files (x86)\Windows Kits\10\Debuggers\x64\cdb.exe',
    [string]$LogDir = (Join-Path $env:APPDATA 'BorgDock\logs')
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Cdb)) { throw "cdb.exe not found at $Cdb (install Debugging Tools for Windows)" }
if (-not $env:_NT_SYMBOL_PATH) {
    # OS + WebView2 frames resolve from the Microsoft symbol server; borgdock.exe
    # frames stay as module+offset because release builds are stripped.
    $env:_NT_SYMBOL_PATH = 'srv*C:\symbols*https://msdl.microsoft.com/download/symbols'
}
New-Item -ItemType Directory -Force $LogDir | Out-Null
$appLog = Join-Path $LogDir 'borgdock.log'

function Capture([System.Diagnostics.Process]$p, [string]$reason) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $txt = Join-Path $LogDir "hang-$stamp.txt"
    $dmp = Join-Path $LogDir "hang-$stamp.dmp"
    Write-Host "[$(Get-Date -Format HH:mm:ss)] TRIGGER ($reason) pid=$($p.Id) -> $txt"
    # -pv: non-invasive attach (threads suspended only while cdb runs, then resumed).
    $cmds = ".echo === $reason ===; .time; ~*kb 40; .echo === modules ===; lm; .dump /ma `"$dmp`"; q"
    & $Cdb -pv -p $p.Id -c $cmds 2>&1 | Out-File -FilePath $txt -Encoding utf8
    Write-Host "[$(Get-Date -Format HH:mm:ss)] captured stacks + minidump"
}

Write-Host "watching '$ProcessName' every ${IntervalSeconds}s (stale log > ${StaleLogSeconds}s, unresponsive x$UnresponsiveChecks). Ctrl+C to stop."
$unresponsive = 0
$capturedForPid = @{}
while ($true) {
    Start-Sleep -Seconds $IntervalSeconds
    $p = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $p) { $unresponsive = 0; continue }
    if ($capturedForPid.ContainsKey($p.Id)) { continue }   # one capture per process instance

    $reason = $null
    if (-not $p.Responding) {
        $unresponsive++
        if ($unresponsive -ge $UnresponsiveChecks) { $reason = "window not responding for $($unresponsive * $IntervalSeconds)s" }
    } else {
        $unresponsive = 0
    }
    if (-not $reason -and $StaleLogSeconds -gt 0 -and (Test-Path $appLog)) {
        $age = ((Get-Date) - (Get-Item $appLog).LastWriteTime).TotalSeconds
        $uptime = ((Get-Date) - $p.StartTime).TotalSeconds
        if ($age -gt $StaleLogSeconds -and $uptime -gt $StaleLogSeconds) { $reason = "borgdock.log stale for $([int]$age)s" }
    }
    if ($reason) {
        Capture $p $reason
        $capturedForPid[$p.Id] = $true
    }
}
