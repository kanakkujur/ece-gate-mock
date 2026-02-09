# STAGE 8 — Frontend Wiring (App/Dashboard/Exam/apiFetch)

## Goal
Connect the React frontend to the Stage-6/7 backend APIs so that:
- Login token is used automatically for API calls
- Main mock start uses backend orchestration (`/api/test/start-main`)
- Submit uses backend evaluator + persistence (`/api/test/submit`)
- History loads from backend (`/api/test/history`)
- Blueprint toggle calls backend (`/api/ai/blueprint?mode=main`)
- AI Subject Generator calls backend (`/api/ai/generate`) and import (`/api/questions/import`)
- UI shows progress overlay while backend is preparing questions

---

## Files updated (Frontend)
- `gate-frontend/src/api.js`
- `gate-frontend/src/App.jsx`
- `gate-frontend/src/Dashboard.jsx`
- `gate-frontend/src/Exam.jsx`

---

## What is working in Stage-8
### 1) Auth-aware API wrapper
`apiFetch()` automatically attaches:
- `Authorization: Bearer <token>`
- Clears auth session on `401` so UI returns to Login.

### 2) Dashboard → Start Main Mock (65)
Main mock start is wired to backend:
- `POST /api/test/start-main { difficulty }`

**Important:** backend Stage-6C supports async progress jobs:
- `POST /api/test/start-main` returns `{ jobId }`
- frontend should poll `/api/test/start-main/status?jobId=...`
until `status=done` and then take `{ result: { testId, questions } }`.

If you are using progress overlay UI, ensure you are using the **jobId polling path** (not assuming immediate `questions` in first response).

### 3) Dashboard → Subject-wise
Subject-wise uses DB bank generation:
- `GET /api/test/generate?count=65&subjects=<SUBJECT>`

### 4) Exam screen
- Question palette
- MCQ / MSQ / NAT answer capture
- Submit triggers:
  - `POST /api/test/submit`
  - refresh history
  - return to dashboard

### 5) AI Subject Generator
- Generate:
  - `POST /api/ai/generate { provider:"openai", mode:"subject", subject, topic, count, difficulty }`
- Import:
  - `POST /api/questions/import { questions:[...] }`

### 6) Blueprint toggle
- `GET /api/ai/blueprint?mode=main`

---

## Clarifications (FAQs)

### Q1) “Every time I click Start exam will it generate questions and save to DB?”
**It depends on DB coverage for that difficulty/subject.**

Backend Stage-6C logic generally does:
1) Try to assemble the paper using existing questions in DB buckets
2) If some bucket is underfilled, call AI generator to create missing questions
3) Insert new generated questions into DB (so next time DB has more)
4) Create a `test_sessions` record with `question_ids` + `questions` snapshot

So:
- **If DB has enough**, it should mostly reuse existing questions (fast).
- **If DB is short**, it generates and inserts to DB (slower, progress overlay).

### Q2) “Do we require AI Subject Generator section?”
It is **optional**.
- Keep it if you want a tool to build DB question bank quickly.
- Remove/hide it if you want the UI to be closer to real GATE portal.

### Q3) “Why GE and EC are not separated like GATE portal?”
Right now the Exam UI shows a single continuous sequence of 65 questions.
To match the real portal UX, the frontend needs:
- A section divider / tabs:
  - **GA (Q1–Q10)**
  - **EC (Q11–Q65)**
- Or a palette toggle filter: show GA only / EC only
- And optionally a label on each question.

Backend already provides `subject`/`section` fields per question (ex: `section=GE/EC`).
Stage-8 wiring is done; **GATE-like section UI** is a **Stage-9 UI enhancement** unless you want to include it as Stage-8 polish.

### Q4) “JSON parse error: Expected ',' or '}' …”
This usually happens when:
- backend returned **non-JSON text** or **partial JSON**
- or a proxy/dev server returned HTML error page
- or your frontend tried to parse a streaming/progress response as JSON

Checklist:
1) Open DevTools → Network → failing request → Response tab
2) If it is HTML (like an error page), fix backend route/crash first
3) If it is progress text, ensure frontend is polling `.../status?jobId=...` and not parsing partial outputs.

---

## Smoke Test checklist (Frontend)
1) Run backend:
   - `cd gate-backend`
   - `npm run dev`
2) Run frontend:
   - `cd gate-frontend`
   - `npm run dev`
3) Login
4) Dashboard:
   - History loads
   - Blueprint toggle works
5) Start Main Mock:
   - shows overlay/progress
   - lands in Exam with 65 questions
6) Submit:
   - returns to dashboard
   - history count increments

---

## Git commands (Stage-8 commit)
From repo root:

```bash
git status
git add gate-frontend/src/api.js gate-frontend/src/App.jsx gate-frontend/src/Dashboard.jsx gate-frontend/src/Exam.jsx docs/STAGE_8_final.md
git commit -m "Stage8: frontend wiring for start-main, submit, history, blueprint, AI subject"
git push origin main
Stage-8 status
✅ Stage-8 is considered DONE when:

login works

start-main reaches exam reliably (with job polling)

submit persists and updates history

no JSON parse errors