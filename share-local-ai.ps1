param([string]$WorkspaceRoot='D:\VSCODE')
$ErrorActionPreference='Stop'
$tunnelRuntime=Join-Path $WorkspaceRoot 'tools\cloudflared\cloudflared.exe'
if(!(Test-Path -LiteralPath $tunnelRuntime)){throw 'Install official cloudflared in D:\VSCODE\tools\cloudflared first.'}
$logRoot=Join-Path $PSScriptRoot 'gate-backend\local-data'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$logPath=Join-Path $logRoot 'tunnel.log'
$outPath=Join-Path $logRoot 'tunnel-output.log'
$null=Invoke-RestMethod 'http://127.0.0.1:4001/api/local/health' -TimeoutSec 5
$process=Start-Process -FilePath $tunnelRuntime -ArgumentList @('tunnel','--no-autoupdate','--url','http://127.0.0.1:4001','--protocol','http2') -WindowStyle Hidden -RedirectStandardError $logPath -RedirectStandardOutput $outPath -PassThru
$url=$null
for($i=0;$i -lt 30;$i++){
    Start-Sleep -Seconds 1
    $text=Get-Content -LiteralPath $logPath -Raw -ErrorAction SilentlyContinue
    if($text -match 'https://[a-z0-9-]+\.trycloudflare\.com'){$url=$Matches[0];break}
    if($process.HasExited){throw "Tunnel exited. See $logPath"}
}
if(!$url){throw "No tunnel URL returned. See $logPath"}
$url | Set-Content -LiteralPath (Join-Path $logRoot 'companion-url.txt')
$process.Id | Set-Content -LiteralPath (Join-Path $logRoot 'tunnel-process.txt')
Write-Host "Live companion: $url"
Write-Host 'Enter this address and the private family key in Connection settings.'
