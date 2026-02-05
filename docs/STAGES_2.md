\# STAGE 2 — DB schema + Auth + JWT verification



\*\*Status:\*\* ✅ Completed  

\*\*Repo root:\*\* `D:\\ece-gate-mock`  

\*\*Backend:\*\* `D:\\ece-gate-mock\\gate-backend`  

\*\*DB:\*\* PostgreSQL local (psql CLI)



---



\## Goal

\- Confirm DB connection as `gate\_user` to `gate\_mock`

\- Create required tables (`users`, `test\_sessions`)

\- Verify `/api/auth/signup` inserts into DB

\- Verify `/api/auth/login` returns JWT

\- Verify JWT works on protected endpoint: `GET /api/ai/blueprint`



---



\## Step A — Confirm DB login (gate\_user → gate\_mock)

```powershell

psql -U gate\_user -d gate\_mock -c "SELECT current\_user, current\_database();"

\## Step B — Create tables (one-time)
Create users
psql -U gate_user -d gate_mock -c "CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL);"

Create test_sessions
psql -U gate_user -d gate_mock -c "CREATE TABLE IF NOT EXISTS test_sessions (id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE, score NUMERIC, accuracy NUMERIC, answers JSONB NOT NULL DEFAULT '{}'::jsonb, totalQuestions INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());"

Verify tables
psql -U gate_user -d gate_mock -c "\dt"


Observed tables:

public.users

public.test_sessions

\## Step C — Backend running

Backend dev server:

cd D:\ece-gate-mock\gate-backend
npm run dev

\## Step D — Signup API (writes to DB)

PowerShell note: Windows curl is Invoke-WebRequest, and -H does NOT behave like Linux curl.
Use Invoke-WebRequest with -ContentType instead.

Signup:

Invoke-WebRequest http://localhost:4000/api/auth/signup `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"stage2_test1@example.com","password":"123456"}' `
  -UseBasicParsing


Observed:

HTTP 200 OK

Response contained user and token

Verify insert:

psql -U gate_user -d gate_mock -c "SELECT id,email FROM users ORDER BY id DESC LIMIT 5;"


Observed:

New user row present (example: id = 8, email = stage2_test1@example.com)

\## Step E — Login API (returns JWT)
Invoke-WebRequest http://localhost:4000/api/auth/login `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"stage2_test1@example.com","password":"123456"}' `
  -UseBasicParsing


Observed:

HTTP 200 OK

Response contained token

\## Step F — JWT verification on protected endpoint

Route confirmed protected in backend:

GET /api/ai/blueprint uses authMiddleware

Important:

Do NOT manually copy token from a truncated ... output.

Capture token programmatically in PowerShell to avoid “Invalid/expired token”.

Login → capture token → call blueprint
$login = Invoke-WebRequest http://localhost:4000/api/auth/login `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"stage2_test1@example.com","password":"123456"}' `
  -UseBasicParsing

$json = $login.Content | ConvertFrom-Json
$token = $json.token

Invoke-WebRequest http://localhost:4000/api/ai/blueprint `
  -Method GET `
  -Headers @{ Authorization = "Bearer $token" } `
  -UseBasicParsing


Observed:

HTTP 200 OK

JSON blueprint returned (example keys: GE, EC distribution)

Fixes / Gotchas

PowerShell curl (Invoke-WebRequest) does not accept -H "Content-Type: ..." like Linux curl.

JWT failures were caused by placeholder/incorrect token usage; capturing token into $token fixed it reliably.

Next stage

STAGE 3:

Frontend login integration with backend

Store JWT in frontend (localStorage/session)

Call protected endpoints from UI

Confirm end-to-end flow: login → fetch blueprint → start exam UI

