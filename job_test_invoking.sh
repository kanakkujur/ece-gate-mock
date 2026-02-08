# 0) Login body
$body = @{
  email    = "kanakkujur1@gmail.com"
  password = "Kanakgate"
} | ConvertTo-Json

# 1) Login
$r = Invoke-RestMethod -Method POST `
  -Uri "http://127.0.0.1:4000/api/auth/login" `
  -ContentType "application/json" `
  -Body $body

$token = $r.token
Write-Host "token: $token"

# 2) Start main test (CAPTURE RESPONSE!)
$start = Invoke-RestMethod -Method POST `
  -Uri "http://127.0.0.1:4000/api/test/start-main" `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body '{"difficulty":"medium"}'

$jobId = $start.jobId
Write-Host "jobId: $jobId"

################################################################

# 3) Poll status
$spin = @('|','/','-','\')
$i = 0

while ($true) {
  try {
    $s = Invoke-RestMethod -Method GET `
      -Uri "http://127.0.0.1:4000/api/test/start-main/status?jobId=$jobId" `
      -Headers @{ Authorization = "Bearer $token" } `
      -ErrorAction Stop
  } catch {
    Write-Host ""
    Write-Host "POLL FAILED ❌ $($_.Exception.Message)"
    break
  }

  $ch = $spin[$i % $spin.Length]; $i++

  $line = "{0} {1,3}% - {2} ({3}) [{4}/{5} generated] [{6}/{7} buckets]" -f `
    $ch, $s.percent, $s.step, $s.status, `
    $s.generatedInserted, $s.generatedTarget, `
    $s.generatedBucketsDone, $s.generatedBucketsTotal

  # Keep on ONE LINE (truncate to console width)
  $maxWidth = $Host.UI.RawUI.WindowSize.Width - 1
  if ($line.Length -gt $maxWidth) { $line = $line.Substring(0, $maxWidth - 3) + "..." }

  # Overwrite the same line fully
  Write-Host -NoNewline ("`r" + $line.PadRight($maxWidth))

  if ($s.status -eq "done") {
    Write-Host ""
    "DONE ✅ testId=$($s.result.testId) questions=$($s.result.questions.Count)"
    break
  }

  if ($s.status -eq "error") {
    Write-Host ""
    "FAILED ❌ $($s.error)"
    break
  }

  Start-Sleep -Milliseconds 800
}
