// FILE: gate-backend/aiProviders/openai.js

import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is missing. Put it in .env or set env var.");
}

const client = new OpenAI({ apiKey });

// Pick model from env or default
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1";

/** Clamp an integer between [a,b] */
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/** Normalize difficulty to easy|medium|hard */
function normalizeDifficulty(d, fallback = "medium") {
  const x = String(d || "").toLowerCase();
  if (x === "easy" || x === "medium" || x === "hard") return x;
  return fallback;
}

/** Normalize type to MCQ|MSQ|NAT */
function normalizeType(t) {
  const x = String(t || "").toUpperCase();
  if (x === "MCQ" || x === "MSQ" || x === "NAT") return x;
  return "MCQ";
}

/** Default type mix: ~60% MCQ, ~20% MSQ, rest NAT */
function defaultTypeMix(n) {
  const mcq = Math.round(n * 0.6);
  const msq = Math.round(n * 0.2);
  return { MCQ: mcq, MSQ: msq, NAT: n - mcq - msq };
}

/**
 * Safe JSON parse for possibly-noisy AI output text.
 * Strips control chars and fixes escaped slash issues,
 * then falls back to last curly-brace JSON block.
 */
function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text
      .replace(/[\u0000-\u001F]+/g, " ")
      .replace(/\\(?!["\\/bfnrtu])/g, "\\\\"); // escape stray backslashes
    const match = cleaned.match(/\{[\s\S]*\}$/);
    if (!match) throw new Error("OpenAI output not valid JSON");
    return JSON.parse(match[0]);
  }
}

/**
 * Normalize OpenAI JSON into shape your importer expects:
 * {
 *   section, subject, topic, difficulty,
 *   questions: [
 *     {subject, topic, type, question, options, answer, marks, neg_marks, solution, source, difficulty}
 *   ]
 * }
 */
function normalizeOpenAIJson(raw, { section, subject, topic, difficulty }) {
  const qs = Array.isArray(raw.questions) ? raw.questions : [];

  return {
    section,
    subject,
    topic,
    difficulty,
    questions: qs.map((q) => {
      const type = normalizeType(q.type);

      // Normalize options
      let options = null;
      if (type !== "NAT") {
        options = {
          A: String(q.options?.A ?? "").trim(),
          B: String(q.options?.B ?? "").trim(),
          C: String(q.options?.C ?? "").trim(),
          D: String(q.options?.D ?? "").trim(),
        };
      }

      // Normalize answer
      let answer = q.answer;
      if (type === "MSQ") {
        if (!Array.isArray(answer)) answer = [];
        answer = answer.map((x) => String(x).trim()).filter(Boolean).sort();
      } else {
        answer = String(answer ?? "").trim();
      }

      return {
        subject,
        topic,
        type,
        question: String(q.question ?? "").trim(),
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

/**
 * Main export: generateQuestions()
 *
 * Called by backend ensureDBHasQuestions({...})
 * with payload like:
 * {
 *   section, subject, topic, count,
 *   typeMix: {MCQ, MSQ, NAT},
 *   difficulty: "easy|medium|hard"
 * }
 */
export async function generateQuestions({
  section = "EC",
  subject,
  topic = "Mixed",
  count = 5,
  typeMix,
  difficulty = "medium",
}) {
  const n = clamp(Number(count) || 1, 1, 100);
  const diff = normalizeDifficulty(difficulty, "medium");
  const mix = typeMix || defaultTypeMix(n);

  // Build JSON-only prompt
  const prompt = `
Return ONLY valid JSON.
NO markdown.
NO extra text outside JSON.

{
  "questions": [
    {
      "type": "MCQ|MSQ|NAT",
      "question": "...",
      "options": {"A":"","B":"","C":"","D":""} | null,
      "answer": "A" | ["A","C"] | 3.14,
      "marks": 1,
      "neg_marks": 0.33,
      "explanation": "short explanation"
    }
  ]
}

Constraints:
- subject: ${subject}
- topic: ${topic}
- difficulty: ${diff}
- total questions: ${n}
- MCQ=${mix.MCQ}, MSQ=${mix.MSQ}, NAT=${mix.NAT}
`.trim();

  // Send to OpenAI Responses API
  const response = await client.responses.create({
    model: MODEL,
    input: prompt,
  });

  const text = response.output?.[0]?.content?.[0]?.text || "";
  const json = safeJsonParse(text);

  return normalizeOpenAIJson(json, {
    section,
    subject,
    topic,
    difficulty: diff,
  });
}
