// FILE: aiProviders/openai.js
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is missing. Put it in .env or set env var.");
}

const client = new OpenAI({ apiKey });
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function normalizeType(t) {
  const x = String(t || "").toUpperCase();
  if (x === "MCQ" || x === "MSQ" || x === "NAT") return x;
  return "MCQ";
}

function defaultTypeMix(count) {
  const mcq = Math.max(0, Math.round(count * 0.6));
  const msq = Math.max(0, Math.round(count * 0.2));
  let nat = count - mcq - msq;
  if (nat < 0) nat = 0;
  return { MCQ: mcq, MSQ: msq, NAT: nat };
}

function isPlainObject(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

function normalizeOpenAIJson(raw, { section, subject, topic, difficulty }) {
  const out = raw && typeof raw === "object" ? raw : {};

  const topSubject = String(out.subject || subject || "").trim();
  const topTopic = String(out.topic || topic || "Mixed").trim();
  const topSection = String(out.section || section || "EC").trim();

  const qs = Array.isArray(out.questions) ? out.questions : [];

  const forcedDifficulty = String(difficulty || "medium").trim().toLowerCase();

  const questions = qs.map((q, idx) => {
    const type = normalizeType(q?.type);

    const qSubject = String(q?.subject || topSubject).trim() || String(subject || "").trim();
    const qTopic = String(q?.topic || topTopic).trim() || String(topic || "Mixed").trim();

    const question = String(q?.question || "").trim();

    // options: required for MCQ/MSQ, must be null for NAT
    let options = null;
    if (type === "NAT") {
      options = null;
    } else {
      const opt = isPlainObject(q?.options) ? q.options : {};
      options = {
        A: String(opt.A ?? "").trim(),
        B: String(opt.B ?? "").trim(),
        C: String(opt.C ?? "").trim(),
        D: String(opt.D ?? "").trim(),
      };
    }

    // answer normalization
    let answer = q?.answer;
    if (type === "MCQ") answer = String(answer ?? "").trim(); // "A"
    if (type === "MSQ") {
      if (!Array.isArray(answer)) answer = [];
      answer = answer.map((x) => String(x).trim()).filter(Boolean).sort();
    }
    if (type === "NAT") {
      answer = answer == null ? "" : String(answer).trim(); // store as string ok
    }

    const marks = Number.isFinite(Number(q?.marks)) ? Number(q.marks) : 1;
    const neg_marks = Number.isFinite(Number(q?.neg_marks)) ? Number(q.neg_marks) : 0.33;

    // map explanation/solution_steps -> solution (DB column "solution")
    const explanation = String(q?.explanation || "").trim();
    const steps = Array.isArray(q?.solution_steps) ? q.solution_steps : [];
    const stepsText = steps.length
      ? `\n\nSteps:\n- ${steps.map((s) => String(s)).join("\n- ")}`
      : "";
    const solution = (explanation || stepsText) ? `${explanation}${stepsText}`.trim() : "";

    // IMPORTANT: difficulty enforcement (prevents "always hard" problem)
    // even if model returns wrong value, we force it to requested difficulty
    const difficultyOut = forcedDifficulty;

    return {
      subject: qSubject,
      topic: qTopic,
      type,
      question,
      options,
      answer,
      marks,
      neg_marks,
      solution,
      source: "AI",
      difficulty: difficultyOut, // optional column (harmless even if DB ignores)
      _meta: { section: topSection, idx },
    };
  });

  return {
    section: topSection,
    subject: topSubject || String(subject || "").trim(),
    topic: topTopic || String(topic || "Mixed").trim(),
    difficulty: forcedDifficulty,
    questions,
  };
}

/**
 * Backend calls this with payload like:
 * {
 *   mode:"subject",
 *   subject, topic, count,
 *   typeMix: {MCQ, MSQ, NAT},
 *   difficulty: "easy|medium|hard"
 * }
 */
export async function generateQuestions({
  section = "EC",
  subject = "Signals and Systems",
  topic = "Mixed",
  count = 5,
  typeMix,
  typesMix,
  difficulty = "medium",
} = {}) {
  const n = clamp(Number(count) || 1, 1, 100);

  const diff = String(difficulty || "medium").toLowerCase();
  const allowed = new Set(["easy", "medium", "hard"]);
  const finalDiff = allowed.has(diff) ? diff : "medium";

  const mix = typeMix || typesMix || defaultTypeMix(n);

  const mcq = Number(mix.MCQ || 0);
  const msq = Number(mix.MSQ || 0);
  let nat = Number(mix.NAT || 0);
  const sum = mcq + msq + nat;
  if (sum !== n) nat = n - (mcq + msq);

  const topicLine = topic ? `Focus topic: ${topic}` : "Topic: Mixed";

  const prompt = `
You are generating ORIGINAL GATE-style questions.
Return ONLY valid JSON (no markdown, no extra text).

Constraints:
- section: ${section}
- subject: ${subject}
- ${topicLine}
- total questions: ${n}
- type mix: MCQ=${mcq}, MSQ=${msq}, NAT=${nat}
- target difficulty: ${finalDiff}

DIFFICULTY RULES (MUST FOLLOW STRICTLY):
- easy:
  - direct concept/formula recall
  - at most 2 short steps
  - NO trick wording, NO multi-concept coupling
- medium:
  - 2–4 steps, one main concept + light secondary idea
  - can include small trap but not lengthy derivation
- hard:
  - 5+ steps OR multi-concept coupling OR lengthy derivation
  - can include tricky corner cases

FORBIDDEN when difficulty=easy:
- multi-concept coupling
- long derivations
- tricky exceptions/corner cases
- more than 2 steps in solution_steps

FORBIDDEN when difficulty=medium:
- more than 4 steps in solution_steps
- multi-page derivations

Rules:
- MCQ: exactly 4 options (A-D), single correct (answer="A")
- MSQ: 4 options (A-D), 2+ correct (answer=["A","C"])
- NAT: numeric answer (answer=number), options MUST be null

JSON schema:
{
  "section": "GE|EC",
  "subject": "string",
  "topic": "string",
  "questions": [
    {
      "type": "MCQ|MSQ|NAT",
      "question": "string",
      "options": {"A":"", "B":"", "C":"", "D":""} | null,
      "answer": "A" | ["A","C"] | 3.14,
      "marks": 1|2,
      "neg_marks": 0.33,
      "difficulty": "easy|medium|hard",
      "explanation": "short explanation",
      "solution_steps": ["step1","step2"]
    }
  ]
}

IMPORTANT:
- Every question.difficulty MUST equal "${finalDiff}" exactly.
`.trim();

  const resp = await client.responses.create({
    model: MODEL,
    input: prompt,
  });

  const text = resp.output?.[0]?.content?.[0]?.text || "";

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}$/);
    if (!m) throw new Error("OpenAI returned non-JSON output.");
    json = JSON.parse(m[0]);
  }

  return normalizeOpenAIJson(json, { section, subject, topic, difficulty: finalDiff });
}
