# Stage 6 — DB-First Test Generation with Progress Tracking (Completed ✅)

This document describes **Stage 6** of the `ece-gate-mock` backend architecture.  
Stage 6 introduces **DB-first test generation**, **deterministic blueprinting**, **AI pool expansion**, and **polling-based progress tracking**.

Status: **✅ COMPLETED & VERIFIED**

---

## 🎯 Goals of Stage 6

1. **Never block test creation due to missing questions**
2. **Prefer DB questions first (DB-first strategy)**
3. **Auto-expand DB using AI when required**
4. **Enforce 40/60 seen/new rule**
5. **Provide real-time progress to frontend/CLI**
6. **Make the process deterministic & debuggable**

---

## 🧱 Architecture Overview

User
└─ POST /api/test/start-main
├─ Job created (jobId)
├─ Background async pipeline starts
└─ Client polls:
GET /api/test/start-main/status?jobId=...

Pipeline:

Blueprint generation

DB pool estimation

AI pool expansion (GE + EC)

Test session creation

Question selection (40/60)

Usage recording

Job completion


---

## 🧩 Subject Canonicalization (Single Source of Truth)

All subjects are defined in one shared file.

```js
// src/constants/subjects.js
export const SUBJECTS = {
  GE: ["General Aptitude"],
  EC: [
    "Engineering Mathematics",
    "Networks",
    "Signals & Systems",
    "Electronic Devices",
    "Analog Circuits",
    "Digital Circuits",
    "Control Systems",
    "Communication Systems",
    "Electromagnetics",
    "Computer Organization",
  ],
};

export const EC_SUBJECTS = SUBJECTS.EC;
export const GE_SUBJECTS = SUBJECTS.GE;
Used by:

Blueprint generator

DB pool logic

AI generation

UI consistency

🧠 Deterministic Blueprinting
File: src/randomizer.js

Key properties:
Seeded RNG (userId + date)

Guarantees:

GE = 10

EC = 55

Total = 65

Per-subject limits:

min = 1

max = 5

Supports EC_MIXED overflow bucket

Blueprint example:

{
  "GE": 10,
  "EC": {
    "Analog Circuits": 5,
    "Networks": 4,
    "Signals & Systems": 5,
    "EC_MIXED": 6
  },
  "total": 65
}
🗄️ DB-First Pool Strategy
Before selecting questions, the system ensures the DB has enough inventory.

Pool sizing rules
Section	Rule
GE	max(80, GE_count × 8)
EC	max(120, subject_count × 10)
🤖 AI-Backed Pool Expansion
File: aiProviders/openai.js

Guarantees:
JSON-only output

Auto-repair malformed JSON

Type mix enforced:

~60% MCQ

~20% MSQ

~20% NAT

Deduplication via question_hash

AI is never used directly in final test selection — only for DB expansion.

🔐 Deduplication Strategy
Each question is hashed using:

difficulty + section + subject + topic +
type + question + options + answer
question_hash = sha256(...)
Insert logic:

ON CONFLICT DO NOTHING
Result:

Safe re-generation

Idempotent imports

No duplicates ever

📊 Progress Job System (Polling-Based)
Job lifecycle
job = {
  status: "running" | "done" | "error",
  percent: 0..100,
  step: "Human readable text",
  generatedInserted,
  generatedTarget,
  generatedBucketsDone,
  generatedBucketsTotal
}
Endpoints
Start job
POST /api/test/start-main
Response:

{ "ok": true, "jobId": "job_..." }
Poll job
GET /api/test/start-main/status?jobId=...
🖥️ CLI / Frontend Friendly Output
Example live output:

46% - Ensuring DB pool: Analog Circuits (running)
[412/804 generated] [5/12 buckets]
Final state:

100% - Done
[714/689 generated] [12/12 buckets]
🎯 40/60 Selection Rule (DB Only)
For each bucket:

Type	Percentage
Previously seen	40%
New questions	60%
Fallback order:

New unseen

Seen

Any (rare)

AI is never used here.

🧪 Debug & Observability
DB inventory visibility
GET /api/debug/db-stats?difficulty=medium
Response:

{
  "difficulty": "medium",
  "total": 763,
  "buckets": [
    { "section": "EC", "subject": "Analog Circuits", "total": 165 }
  ]
}
🧱 Final Output
At completion:

test_sessions row created

65 questions selected

question_usage recorded

Job marked done

Returned to frontend:

{
  "testId": 4,
  "difficulty": "medium",
  "questions": [...]
}
✅ Stage-6 Completion Checklist
Feature	Status
DB-first selection	✅
AI pool expansion	✅
Deduplication	✅
Deterministic blueprint	✅
Progress polling	✅
CLI friendly output	✅
40/60 rule	✅
Subject centralization	✅
Debug endpoints	✅
⏭️ What Comes Next (Stage 7+)
Recommended next stages:

Stage 7: Section-wise difficulty balancing

Stage 8: Adaptive difficulty (based on history)

Stage 9: Analytics + performance curves

Stage 10: Full exam simulation mode

🏁 Summary
Stage-6 is production-ready, scalable, and fully observable.

You now have:

A growing question bank

Deterministic tests

Zero downtime test creation

Clear progress feedback

🚀 You’re ready to push this to Git.