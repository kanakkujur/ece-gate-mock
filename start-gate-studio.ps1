$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
& (Join-Path $PSScriptRoot 'start-local-ai.ps1')
$nodeRuntime = (Get-Command node -ErrorAction Stop).Source
if (!(Test-Path -LiteralPath 'gate-frontend\dist\index.html')) {
    Push-Location 'gate-frontend'
    try { & npm run build; if ($LASTEXITCODE -ne 0) {throw 'Website build failed.'} } finally {Pop-Location}
}
try { $null = Invoke-RestMethod 'http://127.0.0.1:4001/api/local/health' -TimeoutSec 3 } catch {
    Start-Process -FilePath $nodeRuntime -ArgumentList 'local-server.js' -WorkingDirectory (Join-Path $PSScriptRoot 'gate-backend') -WindowStyle Hidden
    Start-Sleep -Seconds 2
}
try { & (Join-Path $PSScriptRoot 'share-local-ai.ps1') } catch { Write-Warning ('Local app is ready; live sharing needs attention: ' + $_.Exception.Message) }
Start-Process 'http://127.0.0.1:4001'
Write-Host 'GATE Studio is available at http://127.0.0.1:4001'
Write-Host 'The family access key is LOCAL_ACCESS_KEY in gate-backend\.env.'
