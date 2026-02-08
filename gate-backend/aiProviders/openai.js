import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OPENAI_API_KEY missing");

const client = new OpenAI({ apiKey });
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1";

/* ------------------ helpers ------------------ */
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function normalizeDifficulty(d, fallback = "medium") {
  const x = String(d || "").toLowerCase();
  return x === "easy" || x === "medium" || x === "hard" ? x : fallback;
}

function normalizeType(t) {
  const x = String(t || "").toUpperCase();
  return x === "MCQ" || x === "MSQ" || x === "NAT" ? x : "MCQ";
}

function defaultTypeMix(n) {
  const mcq = Math.round(n * 0.6);
  const msq = Math.round(n * 0.2);
  return { MCQ: mcq, MSQ: msq, NAT: n - mcq - msq };
}

/**
 * VERY IMPORTANT:
 * - removes control chars
 * - fixes invalid escapes
 * - guarantees parseable JSON
 */
function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text
      .replace(/[\u0000-\u001F]+/g, " ")
      .replace(/\\(?!["\\/bfnrtu])/g, "\\\\"); // escape bad slashes

    const match = cleaned.match(/\{[\s\S]*\}$/);
    if (!match) throw new Error("OpenAI output not JSON");

    return JSON.parse(match[0]);
  }
}

/* ------------------ normalize ------------------ */
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
          A: String(q.options?.A || ""),
          B: String(q.options?.B || ""),
          C: String(q.options?.C || ""),
          D: String(q.options?.D || ""),
        };
      }

      let answer = q.answer;
      if (type === "MSQ") {
        answer = Array.isArray(answer)
          ? answer.map(String).sort()
          : [];
      } else if (type === "NAT") {
        answer = String(answer ?? "");
      } else {
        answer = String(answer ?? "");
      }

      return {
        subject,
        topic,
        type,
        question: String(q.question || ""),
        options,
        answer,
        marks: Number(q.marks) || 1,
        neg_marks: Number(q.neg_marks) || 0.33,
        solution: String(q.explanation || ""),
        source: "AI",
        difficulty,
      };
    }),
  };
}

/* ------------------ main ------------------ */
export async function generateQuestions({
  section = "EC",
  subject,
  topic = "Mixed",
  count = 5,
  typeMix,
  difficulty = "medium",
}) {
  const n = clamp(count, 1, 100);
  const diff = normalizeDifficulty(difficulty);
  const mix = typeMix || defaultTypeMix(n);

  const prompt = `
Return ONLY valid JSON.
NO markdown. NO text outside JSON.

{
  "questions": [
    {
      "type": "MCQ|MSQ|NAT",
      "question": "...",
      "options": {"A":"","B":"","C":"","D":""} | null,
      "answer": "A" | ["A","C"] | 3.14,
      "marks": 1,
      "neg_marks": 0.33,
      "explanation": "short"
    }
  ]
}

Constraints:
- subject: ${subject}
- topic: ${topic}
- difficulty: ${diff}
- MCQ=${mix.MCQ}, MSQ=${mix.MSQ}, NAT=${mix.NAT}
`.trim();

  const resp = await client.responses.create({
    model: MODEL,
    input: prompt,
  });

  const text = resp.output?.[0]?.content?.[0]?.text || "";
  const json = safeJsonParse(text);

  return normalizeOpenAIJson(json, {
    section,
    subject,
    topic,
    difficulty: diff,
  });
}
