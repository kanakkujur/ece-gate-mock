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

function normalizeOpenAIJson(raw, { section, subject, topic }) {
  const out = raw && typeof raw === "object" ? raw : {};
  const topSubject = String(out.subject || subject || "").trim();
  const topTopic = String(out.topic || topic || "Mixed").trim();
  const topSection = String(out.section || section || "EC").trim();

  const qs = Array.isArray(out.questions) ? out.questions : [];

  const questions = qs.map((q, idx) => {
    const type = normalizeType(q.type);
    const qSubject = String(q.subject || topSubject).trim();
    const qTopic = String(q.topic || topTopic).trim();

    const question = String(q.question || "").trim();

    // options: required for MCQ/MSQ, must be null for NAT
    let options = null;
    if (type === "NAT") {
      options = null;
    } else {
      const opt = q.options && typeof q.options === "object" ? q.options : {};
      options = {
        A: String(opt.A ?? "").trim(),
        B: String(opt.B ?? "").trim(),
        C: String(opt.C ?? "").trim(),
        D: String(opt.D ?? "").trim(),
      };
    }

    // answer normalization
    let answer = q.answer;
    if (type === "MCQ") answer = String(answer ?? "").trim(); // "A"
    if (type === "MSQ") {
      if (!Array.isArray(answer)) answer = [];
      answer = answer.map((x) => String(x).trim()).filter(Boolean).sort();
    }
    if (type === "NAT") {
      // allow number or numeric string; store as string is ok for your DB
      answer = answer == null ? "" : String(answer).trim();
    }

    const marks = Number.isFinite(Number(q.marks)) ? Number(q.marks) : 1;
    const neg_marks =
      Number.isFinite(Number(q.neg_marks)) ? Number(q.neg_marks) : 0.33;

    // map explanation/solution_steps -> solution (your DB column is "solution")
    const explanation = String(q.explanation || "").trim();
    const steps = Array.isArray(q.solution_steps) ? q.solution_steps : [];
    const stepsText = steps.length
      ? `\n\nSteps:\n- ${steps.map((s) => String(s)).join("\n- ")}`
      : "";

    const solution = (explanation || stepsText)
      ? `${explanation}${stepsText}`.trim()
      : "";

    return {
      // IMPORTANT: include subject/topic per question -> importer is happy
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
      // keep any extras if you want later
      _meta: {
        section: topSection,
        idx,
      },
    };
  });

  return {
    section: topSection,
    subject: topSubject,
    topic: topTopic,
    questions,
  };
}

/**
 * Backend calls this with payload like:
 * {
 *   mode:"subject",
 *   subject, topic, count,
 *   typeMix: {MCQ, MSQ, NAT}
 * }
 */
export async function generateQuestions({
  section = "EC",
  subject = "Signals and Systems",
  topic = "Mixed",
  count = 5,
  // accept BOTH names to avoid mismatch bugs
  typeMix,
  typesMix,
  difficulty = "gate-standard",
} = {}) {
  const n = clamp(Number(count) || 1, 1, 100);

  const mix = typeMix || typesMix || defaultTypeMix(n);

  // fix rounding issues if any
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
- difficulty: ${difficulty}
- total questions: ${n}
- type mix: MCQ=${mcq}, MSQ=${msq}, NAT=${nat}

Rules:
- MCQ: exactly 4 options (A-D), single correct (answer="A")
- MSQ: 4 options (A-D), 2+ correct (answer=["A","C"])
- NAT: numeric answer (answer=number), options MUST be null
- Each question must include:
  type, question, options, answer, marks (1 or 2), explanation, solution_steps

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
      "explanation": "short explanation",
      "solution_steps": ["step1","step2"]
    }
  ]
}
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

  // IMPORTANT: normalize to match your importer expectations
  return normalizeOpenAIJson(json, { section, subject, topic });
}
