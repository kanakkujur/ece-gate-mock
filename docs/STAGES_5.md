# STAGE-5 — AI Question Generation + Clean Import Pipeline (OpenAI + DB)

## Goal
Enable the platform to:
1) Generate brand-new GATE-style questions using AI (OpenAI now; local later),
2) Import those questions into the Postgres `questions` bank safely,
3) Verify generation, import, and retrieval via API + DB checks.

This stage makes AI content part of the same pipeline as seeded questions.

---

## What we added / finalized

### 1) AI generation endpoint
**Endpoint:** `POST /api/ai/generate`  
**Auth:** Required (Bearer JWT)

Supports:
- `mode = "subject"` → generate questions for 1 subject/topic
- `mode = "main"` → generate a full main-paper plan (GE + EC mix)

**Example (subject mode):**
```powershell
$login = Invoke-WebRequest http://127.0.0.1:4000/api/auth/login `
  -Method POST -ContentType "application/json" `
  -Body '{"email":"stage2_test1@example.com","password":"123456"}' -UseBasicParsing

$token = ($login.Content | ConvertFrom-Json).token

$gen = Invoke-WebRequest http://127.0.0.1:4000/api/ai/generate `
  -Method POST -ContentType "application/json" `
  -Headers @{ Authorization = "Bearer $token" } `
  -Body '{"provider":"openai","mode":"subject","subject":"Networks","topic":"Basics","count":5}' `
  -UseBasicParsing

$genJson = $gen.Content | ConvertFrom-Json
$genJson.questions.Count


2) Import endpoint (AI → DB)

Endpoint: POST /api/questions/import
Auth: Required (Bearer JWT)

Purpose: Take an array of questions and insert them into Postgres questions.

Validation rules:

questions[] required (1..200)

subject required for each question

question required

type normalized to MCQ | MSQ | NAT

options required for MCQ/MSQ, optional for NAT

Import Example (recommended)
If AI output includes subject/topic inside each question row, import can be minimal:

$payload = @{ questions = $genJson.questions } | ConvertTo-Json -Depth 20

Invoke-WebRequest http://127.0.0.1:4000/api/questions/import `
  -Method POST -ContentType "application/json" `
  -Headers @{ Authorization = "Bearer $token" } `
  -Body $payload -UseBasicParsing


Optional defaults (fallback):
If the provider doesn’t include subject/topic in each question row:

$payloadObj = @{
  defaultSubject = "Networks"
  defaultTopic   = "Basics"
  questions      = $genJson.questions
}
$payload = $payloadObj | ConvertTo-Json -Depth 20

3) Verify import in Postgres
psql -U gate_user -d gate_mock -c `
"SELECT id, subject, topic, type, source FROM questions ORDER BY id DESC LIMIT 10;"


Expected:

New rows appear

source shows AI

subject/topic/type populated

4) Verify test generation pulls AI questions too

Endpoint: GET /api/test/generate?count=5&subjects=Networks

Invoke-WebRequest "http://127.0.0.1:4000/api/test/generate?count=5&subjects=Networks" `
  -Headers @{ Authorization = "Bearer $token" } -UseBasicParsing


This pulls from the unified questions table — seed + AI together.

Important note: History is PER USER

GET /api/test/history returns only sessions for the logged-in user (JWT user_id).
So if you:

submit a test from account A → history shows in A

login with account B → history is empty until B submits a test

Quick history creation test
# Generate test
$genTest = Invoke-WebRequest "http://127.0.0.1:4000/api/test/generate?count=5" `
  -Headers @{ Authorization = "Bearer $token" } -UseBasicParsing
$genObj = $genTest.Content | ConvertFrom-Json

# Submit (creates a session row)
$submitBody = @{
  score = 0
  accuracy = 0
  totalQuestions = $genObj.count
  answers = @{}
  mode = "main"
  subject = "EC"
  remainingTime = 0
} | ConvertTo-Json -Depth 20

Invoke-WebRequest http://127.0.0.1:4000/api/test/submit `
  -Method POST -ContentType "application/json" `
  -Headers @{ Authorization = "Bearer $token" } `
  -Body $submitBody -UseBasicParsing

# Now history shows 1 row
Invoke-WebRequest "http://127.0.0.1:4000/api/test/history" `
  -Headers @{ Authorization = "Bearer $token" } -UseBasicParsing

Common Windows curl issue (PowerShell)

In PowerShell, curl is an alias for Invoke-WebRequest, so this fails:

curl -H "Authorization: Bearer TOKEN" ...


Use either:

curl.exe (real curl)

curl.exe -H "Authorization: Bearer $token" "http://127.0.0.1:4000/api/test/history"


OR:

Invoke-WebRequest with a headers dictionary:

Invoke-WebRequest "http://127.0.0.1:4000/api/test/history" `
  -Headers @{ Authorization = "Bearer $token" } -UseBasicParsing

Result of Stage-5

✅ AI generation works (/api/ai/generate)
✅ AI import works (/api/questions/import)
✅ DB shows AI rows in questions
✅ Test generation pulls from unified bank
✅ History behavior verified per-user

## What’s next in Stage-5 (if you want to continue beyond “Clean”)
Pick one (no need to do all at once):

**Stage-5B (Frontend Admin AI Loader):**
- Add a small “AI Import” panel in Dashboard:
  - Subject, Topic, Count, Provider dropdown
  - “Generate + Import” button
  - Show “inserted N questions”

**Stage-5C (Quality + Dedup):**
- Add `hash` (or `question_fingerprint`) column to `questions`
- Avoid inserting duplicates (same prompt regenerations)

**Stage-5D (Local provider enable):**
- Implement `local.js` to call Ollama (`/api/generate`) and output the same JSON schema.

If you tell me which one you want, I’ll give the exact code changes + files to paste.
::contentReference[oaicite:0]{index=0}

