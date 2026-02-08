// FILE: aiProviders/openai.js
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OPENAI_API_KEY missing");

const client = new OpenAI({ apiKey });
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1";

/* ---------------- Utils ---------------- */

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function normalizeDifficulty(d, fallback = "medium") {
  const x = String(d || "").toLowerCase().trim();
  return ["easy", "medium", "hard"].includes(x) ? x : fallback;
}

function normalizeType(t) {
  const x = String(t || "").toUpperCase();
  return x === "MCQ" || x === "MSQ" || x === "NAT" ? x : "MCQ";
}

function defaultTypeMix(count) {
  const mcq = Math.round(count * 0.6);
  const msq = Math.round(count * 0.2);
  const nat = count - mcq - msq;
  return { MCQ: mcq, MSQ: msq, NAT: nat };
}

/* ---------- CRITICAL: Safe JSON extractor ---------- */

function safeParseJSON(text) {
  if (!text) throw new Error("Empty OpenAI response");

  // Remove control chars (kills JSON.parse)
  let cleaned = text
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\\(?!["\\/bfnrtu])/g, "\\\\"); // fix bad backslashes

  // Extract last JSON object
  const match = cleaned.match(/\{[\s\S]*\}$/);
  if (!match) {
    throw new Error("OpenAI response does not contain JSON");
  }

  try {
    return JSON.parse(match[0]);
  } catch (e) {
    console.error("❌ JSON parse failed. Raw snippet:");
    console.error(match[0].slice(0, 500));
    throw new Error("OpenAI returned invalid JSON");
  }
}

/* ---------- Normalize to DB schema ---------- */

function normalizeOpenAIJson(raw, { section, subject, topic, difficulty }) {
  const qs = Array.isArray(raw.questions) ? raw.questions : [];

  return {
    section,
    subject,
    topic,
    difficulty,
    questions: qs.map((q) => {
      const type = normalizeType(q.type);

      let options = null;
      if (type !== "NAT") {
        options = {
          A: String(q?.options?.A ?? "").trim(),
          B: String(q?.options?.B ?? "").trim(),
          C: String(q?.options?.C ?? "").trim(),
          D: String(q?.options?.D ?? "").trim(),
        };
      }

      let answer = q.answer;
      if (type === "MSQ" && Array.isArray(answer)) {
        answer = answer.map(String).sort();
      }
      if (type !== "MSQ") {
        answer = String(answer ?? "").trim();
      }

      return {
        subject: String(q.subject || subject).trim(),
        topic: String(q.topic || topic || "Mixed").trim(),
        type,
        question: String(q.question || "").trim(),
        options,
        answer,
        marks: Number(q.marks) || 1,
        neg_marks: Number(q.neg_marks) || 0.33,
        solution: String(q.explanation || "").trim(),
        source: "AI",
        difficulty,
      };
    }),
  };
}

/* ---------------- MAIN ENTRY ---------------- */

export async function generateQuestions({
  section = "EC",
  subject,
  topic = "Mixed",
  count = 5,
  typeMix,
  difficulty = "medium",
} = {}) {
  const n = clamp(Number(count), 1, 100);
  const diff = normalizeDifficulty(difficulty);
  const mix = typeMix || defaultTypeMix(n);

  const prompt = `
Return ONLY valid JSON. No markdown. No commentary.

Schema:
{
  "questions": [
    {
      "type": "MCQ|MSQ|NAT",
      "question": "string",
      "options": {"A":"","B":"","C":"","D":""} | null,
      "answer": "A" | ["A","C"] | 3.14,
      "marks": 1,
      "neg_marks": 0.33,
      "difficulty": "${diff}",
      "explanation": "short explanation"
    }
  ]
}

Constraints:
- subject: ${subject}
- topic: ${topic}
- difficulty: ${diff}
- MCQ=${mix.MCQ}, MSQ=${mix.MSQ}, NAT=${mix.NAT}
- NO latex
- NO backticks
- ASCII only
`;

  const resp = await client.responses.create({
    model: MODEL,
    input: prompt,
  });

  const text = resp.output?.[0]?.content?.[0]?.text || "";

  const json = safeParseJSON(text);

  return normalizeOpenAIJson(json, {
    section,
    subject,
    topic,
    difficulty: diff,
  });
}
