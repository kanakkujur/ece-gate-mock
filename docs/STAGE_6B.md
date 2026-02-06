# Stage-6B (Option A) — Frontend Difficulty Selection (Subject mode only)

## Goal
Expose difficulty selection in the frontend **only for AI Subject Generation**, keeping all existing Stage-4/5 flows unchanged.

## What changed
### Frontend (Dashboard)
- Added UI controls in **Subject-wise mode**:
  - Difficulty dropdown: `easy | medium | hard`
  - Topic input
  - Count input
  - Provider dropdown: `openai | auto | local`
- Added **Generate AI Questions** button:
  - Calls `POST /api/ai/generate`
  - Sends:  
    ```json
    {
      "provider": "openai",
      "mode": "subject",
      "subject": "<selected subject>",
      "topic": "<topic>",
      "count": <count>,
      "difficulty": "easy|medium|hard"
    }
    ```
- Added optional **Import into DB** button:
  - Calls `POST /api/questions/import`
  - Sends `{ questions: <generatedQuestions>, defaultSubject, defaultTopic }`

## Files changed
- `gate-frontend/src/Dashboard.jsx`

## How to test (UI)
1. Login as any user.
2. Switch to **Subject-wise**.
3. Pick a Subject (e.g., Networks).
4. Select Difficulty (easy/medium/hard), Topic, Count.
5. Click **Generate AI Questions**.
6. Verify difficulty:
   - Preview shows difficulty per question
   - Raw JSON contains `question.difficulty` matching selection
7. (Optional) Click **Import into DB** and verify in Postgres:
   ```sql
   SELECT id, subject, topic, type, source FROM questions ORDER BY id DESC LIMIT 10;


📘 STAGE_6B — Frontend Difficulty Control (Subject Mode Only)
Status: IN PROGRESS → TARGET COMPLETE
🎯 Goal

Expose difficulty selection (easy / medium / hard) in the frontend for:

👉 AI Subject-wise generation only

Everything else remains unchanged.

✅ Scope (Option A — Safe & Minimal)

We are NOT touching:

Main mock generation

Test engine

History

Autosave

Database

Stage-4 & Stage-5 flows

We ARE adding:

Difficulty dropdown in frontend

Passing difficulty into /api/ai/generate (subject mode only)

🧠 Backend Status (Already Done in Stage-6A)

Confirmed working:

{
  "difficulty": "easy"
}


Response returns:

questions[].difficulty === "easy"


✅ Backend complete

🎨 Frontend Changes (Stage-6B)
1️⃣ Add Difficulty State

In Dashboard (or AI generate screen):

const [difficulty, setDifficulty] = useState("medium");

2️⃣ Add Difficulty Dropdown (Subject Mode Only)

Inside subject-mode UI:

{mode === "subject" && (
  <>
    <select
      value={subject}
      onChange={(e) => setSubject(e.target.value)}
    >
      <option>Networks</option>
      <option>Digital Electronics</option>
      <option>Control Systems</option>
      <option>Signals and Systems</option>
      <option>Analog Circuits</option>
      <option>Communication</option>
      <option>Electromagnetics</option>
      <option>Electronic Devices</option>
      <option>Engineering Mathematics</option>
    </select>

    <select
      value={difficulty}
      onChange={(e) => setDifficulty(e.target.value)}
    >
      <option value="easy">Easy</option>
      <option value="medium">Medium</option>
      <option value="hard">Hard</option>
    </select>
  </>
)}

3️⃣ Pass Difficulty into API Call

Wherever subject AI generation is triggered:

await fetch("/api/ai/generate", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify({
    provider: "openai",
    mode: "subject",
    subject,
    topic,
    count: 5,
    difficulty   // 👈 NEW
  })
});

✅ Definition of Done (Stage-6B)

✔ Difficulty selector visible only in Subject mode
✔ API request includes "difficulty"
✔ Response returns matching difficulty
✔ No regression in other flows

🧪 Quick Test

Select:

Subject Difficulty
Networks  easy
Networks  hard

Verify API payload:

"difficulty": "easy"


Verify response:

questions[0].difficulty === "easy"

📦 Git Commit Suggestion
git add .
git commit -m "Stage-6B: Frontend difficulty selector for AI subject generation"
git push

🚀 After Stage-6B

Next stages will unlock:

Stage-6C → difficulty for Main mock
Stage-7 → performance analytics
Stage-8 → adaptive difficulty
Stage-9 → real exam simulation