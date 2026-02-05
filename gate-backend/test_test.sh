$req = @{
  mode="main"
  provider="openai"
  count=65
  seed=123
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:4000/api/ai/generate" -Method POST -ContentType "application/json" -Headers @{ Authorization="Bearer $token" } -Body $req
