param([string]$WorkspaceRoot='D:\VSCODE')
$ErrorActionPreference='Stop'
$tunnelRuntime=Join-Path $WorkspaceRoot 'tools\cloudflared\cloudflared.exe'
if(!(Test-Path -LiteralPath $tunnelRuntime)){throw 'Install official cloudflared in D:\VSCODE\tools\cloudflared first.'}
$logRoot=Join-Path $PSScriptRoot 'gate-backend\local-data'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$logPath=Join-Path $logRoot 'tunnel.log'
$outPath=Join-Path $logRoot 'tunnel-output.log'
$null=Invoke-RestMethod 'http://127.0.0.1:4001/api/local/health' -TimeoutSec 5
function Publish-CurrentCompanion {
    & node (Join-Path $PSScriptRoot 'gate-backend\scripts\publish-companion.mjs')
    if($LASTEXITCODE -ne 0){throw 'Could not update the permanent website host pointer.'}
    & node (Join-Path $PSScriptRoot 'gate-backend\scripts\create-family-setup.mjs')
    if($LASTEXITCODE -ne 0){throw 'Could not create private family setup files.'}
}
$processFile=Join-Path $logRoot 'tunnel-process.txt'
$urlFile=Join-Path $logRoot 'companion-url.txt'
if((Test-Path -LiteralPath $processFile) -and (Test-Path -LiteralPath $urlFile)){
    $runningTunnelId=(Get-Content -LiteralPath $processFile -Raw).Trim() -as [int]
    $runningTunnel=if($runningTunnelId){Get-CimInstance Win32_Process -Filter "ProcessId=$runningTunnelId" -ErrorAction SilentlyContinue}
    if($runningTunnel.Name -eq 'cloudflared.exe' -and $runningTunnel.CommandLine -like '*http://127.0.0.1:4001*'){
        Publish-CurrentCompanion
        Write-Host 'Existing live companion reused. Share the permanent GitHub website link.'
        return
    }
}

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
Publish-CurrentCompanion
Write-Host 'Share https://kanakkujur.github.io/ece-gate-mock/ and the private family key. The host address updates automatically.'
