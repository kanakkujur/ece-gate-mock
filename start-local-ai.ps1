param([string]$WorkspaceRoot = 'D:\VSCODE')
$ErrorActionPreference = 'Stop'
$runtime = Join-Path $WorkspaceRoot 'tools\ollama\ollama.exe'
$modelStore = Join-Path $WorkspaceRoot 'models\ollama'
if (!(Test-Path -LiteralPath $runtime)) { throw "Ollama not found: $runtime" }
if (!(Test-Path -LiteralPath $modelStore)) { throw "Model store not found: $modelStore" }
try {
    $null = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3
} catch {
    $env:OLLAMA_MODELS = $modelStore
    $env:OLLAMA_HOST = '127.0.0.1:11434'
    Start-Process -FilePath $runtime -ArgumentList 'serve' -WindowStyle Hidden
    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Seconds 1
        try {
            $null = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2
            $ready = $true
            break
        } catch {}
    }
    if (!$ready) { throw 'Ollama did not become ready on port 11434.' }
}
$models = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 5
if ('deepseek-r1:7b' -notin $models.models.name) { throw 'The saved deepseek-r1:7b model is not available in this Ollama service.' }
Write-Host 'Local DeepSeek API ready at http://127.0.0.1:11434. No paid API key needed.'
