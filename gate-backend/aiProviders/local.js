// gate-backend/aiProviders/local.js

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = String(text || "").match(/\{[\s\S]*\}$/);
    if (!m) throw new Error("Local LLM returned non-JSON output.");
    return JSON.parse(m[0]);
  }
}

export async function generateWithLocal(prompt) {
  const base = process.env.LOCAL_LLM_URL || "http://127.0.0.1:11434";
  const model = process.env.LOCAL_LLM_MODEL || "llama3.1";

  const r = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
  });

  if (!r.ok) throw new Error(`Local LLM failed (${r.status})`);
  const data = await r.json();
  return data.response;
}

export async function generateQuestions({
  mode = "subject",
  subject = "Networks",
  topic = "Basics",
  count = 5,
  typeMix, // optional
  difficulty = "gate-standard",
} = {}) {
  const n = clamp(Number(count) || 1, 1, 100);

  const mix = typeMix && typeof typeMix === "object"
    ? typeMix
    : { MCQ: Math.floor(n * 0.6), MSQ: Math.floor(n * 0.2), NAT: n - (Math.floor(n * 0.6) + Math.floor(n * 0.2)) };

  const prompt = `
You generate original GATE-style questions.
Return ONLY valid JSON. No markdown. No extra text.

MODE: ${mode}
SUBJECT: ${subject}
TOPIC: ${topic}
DIFFICULTY: ${difficulty}
TOTAL: ${n}
TYPE MIX: MCQ=${mix.MCQ || 0}, MSQ=${mix.MSQ || 0}, NAT=${mix.NAT || 0}

Rules:
- MCQ: 4 options (A-D), exactly 1 correct, answer is "A"/"B"/"C"/"D"
- MSQ: 4 options (A-D), 2+ correct, answer is array like ["A","C"]
- NAT: numeric answer, options must be null
- Each question must include: subject, topic, type, marks (1 or 2), neg_marks (0.33 for MCQ/MSQ, 0 for NAT),
  question, options (object for MCQ/MSQ, null for NAT), answer, solution (short text).

JSON schema:
{
  "mode": "subject",
  "subject": "string",
  "topic": "string",
  "questions": [
    {
      "subject": "string",
      "topic": "string",
      "type": "MCQ|MSQ|NAT",
      "marks": 1|2,
      "neg_marks": 0.33|0,
      "question": "string",
      "options": {"A":"", "B":"", "C":"", "D":""} | null,
      "answer": "A" | ["A","C"] | 3.14,
      "solution": "string"
    }
  ]
}
`.trim();

  const text = await generateWithLocal(prompt);
  const json = tryParseJson(text);

  // Minimal normalize
  return {
    provider: "local",
    mode: json.mode || mode,
    subject: json.subject || subject,
    topic: json.topic || topic,
    questions: Array.isArray(json.questions) ? json.questions : [],
  };
}
