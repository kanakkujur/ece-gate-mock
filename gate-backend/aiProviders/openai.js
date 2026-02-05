// aiProviders/openai.js
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is missing. Put it in .env or set env var.");
}

const client = new OpenAI({ apiKey });

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1";

// helper
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/**
 * Generate questions in strict JSON format.
 * typesMix example: { MCQ: 35, MSQ: 10, NAT: 10 } (must sum to count)
 */
export async function generateQuestions({
  section = "EC",              // "GE" or "EC"
  subject = "Signals & Systems",
  topic = "",
  count = 5,
  typesMix,                    // optional
  difficulty = "gate-standard",
} = {}) {
  count = clamp(Number(count) || 1, 1, 100);

  // default mix (you can tune)
  const mix = typesMix || {
    MCQ: Math.floor(count * 0.6),
    MSQ: Math.floor(count * 0.2),
    NAT: count - (Math.floor(count * 0.6) + Math.floor(count * 0.2)),
  };

  const mixSum = (mix.MCQ || 0) + (mix.MSQ || 0) + (mix.NAT || 0);
  if (mixSum !== count) {
    // fix rounding issues
    mix.NAT = count - ((mix.MCQ || 0) + (mix.MSQ || 0));
  }

  const topicLine = topic ? `Focus topic: ${topic}` : "Topic: (broad within subject)";

  const prompt = `
You are generating original GATE-style questions.
Return ONLY valid JSON (no markdown, no extra text).

Constraints:
- section: ${section}
- subject: ${subject}
- ${topicLine}
- difficulty: ${difficulty}
- total questions: ${count}
- type mix: MCQ=${mix.MCQ}, MSQ=${mix.MSQ}, NAT=${mix.NAT}

Question rules:
- MCQ: exactly 4 options, single correct (answer = option key like "A")
- MSQ: 4 options, 2+ correct (answer = array of option keys like ["A","C"])
- NAT: numeric answer (answer = number), include tolerance if needed.
- Each question must include:
  id, type, question, options (null for NAT), answer, marks (1 or 2), explanation, solution_steps

JSON schema:
{
  "section": "GE|EC",
  "subject": "string",
  "topic": "string",
  "questions": [
    {
      "id": "q1",
      "type": "MCQ|MSQ|NAT",
      "question": "string",
      "options": {"A":"", "B":"", "C":"", "D":""} | null,
      "answer": "A" | ["A","C"] | 3.14,
      "marks": 1|2,
      "explanation": "short explanation",
      "solution_steps": ["step1","step2","..."]
    }
  ]
}
`.trim();

  const resp = await client.responses.create({
    model: MODEL,
    input: prompt,
  });

  // responses API returns text in output[...]
  const text = resp.output?.[0]?.content?.[0]?.text || "";
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    // fallback: try to extract JSON block if model added text
    const m = text.match(/\{[\s\S]*\}$/);
    if (!m) throw new Error("OpenAI returned non-JSON output.");
    json = JSON.parse(m[0]);
  }
  return json;
}
