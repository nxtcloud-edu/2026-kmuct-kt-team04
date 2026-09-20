$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$tunnelCommand = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $tunnelCommand) {
    throw 'cloudflared is not installed. Install the official Cloudflare.cloudflared package with winget, open a new terminal, then run this script again. See docs/SHARED-DEMO.md.'
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist/index.html'))) { throw 'Run npm run build:shared first.' }
$dataDirectory = Join-Path $projectRoot '.local-data'
New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
$serverProcess = $null
$tunnelProcess = $null
try {
    try { $status = Invoke-RestMethod 'http://127.0.0.1:4173/api/local-status' -TimeoutSec 3 }
    catch { $status = $null }
    if (-not $status) {
        $nodePath = (Get-Command node).Source
        $serverProcess = Start-Process -FilePath $nodePath -ArgumentList @('--import', 'tsx', 'server/start.ts') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataDirectory 'shared-server.log') -RedirectStandardError (Join-Path $dataDirectory 'shared-server-error.log')
        $deadline = (Get-Date).AddSeconds(20)
        do {
            Start-Sleep -Milliseconds 500
            try { $status = Invoke-RestMethod 'http://127.0.0.1:4173/api/local-status' -TimeoutSec 2 } catch { $status = $null }
        } until ($status -or (Get-Date) -gt $deadline -or $serverProcess.HasExited)
        if (-not $status) { throw 'Shared server failed to start. See .local-data/shared-server-error.log.' }
    }
    if ($status.storage -ne 'shared-file') { throw 'Port 4173 is not running the shared-room server.' }
    $logFile = Join-Path $dataDirectory 'public-tunnel.log'
    $tunnelProcess = Start-Process -FilePath $tunnelCommand.Source -ArgumentList @('tunnel', '--url', 'http://127.0.0.1:4173', '--http-host-header', 'localhost:4173', '--protocol', 'http2') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataDirectory 'public-tunnel-output.log') -RedirectStandardError $logFile
    $deadline = (Get-Date).AddSeconds(60)
    $publicUrl = $null
    do {
        Start-Sleep -Milliseconds 500
        if (Test-Path -LiteralPath $logFile) {
            $match = [regex]::Match([IO.File]::ReadAllText($logFile), 'https://[a-z0-9-]+\.trycloudflare\.com')
            if ($match.Success) { $publicUrl = $match.Value }
        }
    } until ($publicUrl -or (Get-Date) -gt $deadline -or $tunnelProcess.HasExited)
    if (-not $publicUrl) { throw 'Public URL could not be created. See .local-data/public-tunnel.log.' }
    [IO.File]::WriteAllText((Join-Path $dataDirectory 'public-origin.txt'), $publicUrl)
    Write-Host "PUBLIC DEMO: $publicUrl"
    Write-Host 'Register this exact HTTPS origin in Kakao Developers web domains. Share the same URL with both participants.'
    Write-Host 'Keep this terminal and this computer running. Ctrl+C stops the tunnel.'
    Wait-Process -Id $tunnelProcess.Id
} finally {
    if ($tunnelProcess -and -not $tunnelProcess.HasExited) { Stop-Process -Id $tunnelProcess.Id }
    if ($serverProcess -and -not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id }
}
