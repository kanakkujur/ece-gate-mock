// FILE: gate-backend/src/evaluator.js
// Stage-7A: Evaluator logic (MCQ/MSQ/NAT)

function sanitizeType(t) {
  const x = String(t || "").toUpperCase();
  if (x === "MCQ" || x === "MSQ" || x === "NAT") return x;
  return "MCQ";
}

function normStr(x) {
  return String(x ?? "").trim();
}

function isEmptyAnswer(v) {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  const s = String(v).trim();
  return s === "";
}

function parseMsq(v) {
  if (Array.isArray(v)) {
    return new Set(v.map((x) => String(x).trim().toUpperCase()).filter(Boolean));
  }
  return new Set(
    String(v ?? "")
      .split(",")
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean)
  );
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function parseNat(v) {
  // Accept numeric string or number; fallback to string if NaN.
  const s = String(v ?? "").trim();
  if (s === "") return { kind: "empty", value: null };
  const n = Number(s);
  if (Number.isFinite(n)) return { kind: "num", value: n };
  return { kind: "str", value: s };
}

function natEqual(user, correct, absTol, relTol) {
  if (user.kind === "empty") return false;
  if (user.kind === "str" || correct.kind === "str") {
    return String(user.value ?? "").trim() === String(correct.value ?? "").trim();
  }
  // number-number compare with tolerances
  const a = user.value;
  const b = correct.value;
  const diff = Math.abs(a - b);
  if (diff <= absTol) return true;
  const denom = Math.max(1e-9, Math.abs(b));
  return diff / denom <= relTol;
}

/**
 * Attempt output:
 * {
 *   items: [
 *     { index, questionId, subject, topic, type, marks, negMarks, answerGiven, correctAnswer,
 *       isCorrect, isWrong, isSkipped, marksAwarded, negAwarded }
 *   ],
 *   totals: { correct, wrong, skipped, attempted }
 * }
 *
 * answers format supported:
 * - object keyed by question id: { "123": "A", "124": ["A","C"], "125": "3.5" }
 * - array aligned with questions: [..]
 */
export function evaluateAttempt({ questions, answers, natAbsTol = 0.01, natRelTol = 0.001 }) {
  const qs = Array.isArray(questions) ? questions : [];
  const ans = answers ?? {};

  const isArrayAnswers = Array.isArray(ans);

  const items = [];
  let correct = 0;
  let wrong = 0;
  let skipped = 0;

  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    const type = sanitizeType(q.type);
    const marks = Number(q.marks) || 1;
    const negMarks = Number(q.neg_marks) || 0;

    const qid = q.id ?? null;

    let given;
    if (isArrayAnswers) {
      given = ans[i];
    } else if (qid != null && Object.prototype.hasOwnProperty.call(ans, String(qid))) {
      given = ans[String(qid)];
    } else if (Object.prototype.hasOwnProperty.call(ans, String(i))) {
      // fallback if frontend stores by index as string keys
      given = ans[String(i)];
    } else {
      given = null;
    }

    const correctRaw = q.answer;

    let isSkipped = isEmptyAnswer(given);
    let isCorrect = false;

    if (!isSkipped) {
      if (type === "MCQ") {
        isCorrect = normStr(given).toUpperCase() === normStr(correctRaw).toUpperCase();
      } else if (type === "MSQ") {
        const ug = parseMsq(given);
        const cg = parseMsq(correctRaw);
        isCorrect = setsEqual(ug, cg);
      } else {
        const ug = parseNat(given);
        const cg = parseNat(correctRaw);
        isCorrect = natEqual(ug, cg, natAbsTol, natRelTol);
      }
    }

    const isWrong = !isSkipped && !isCorrect;

    let marksAwarded = 0;
    let negAwarded = 0;

    if (isCorrect) {
      marksAwarded = marks;
    } else if (isWrong) {
      // GATE typical: MCQ negative, MSQ no negative, NAT no negative
      if (type === "MCQ") negAwarded = negMarks;
    }

    if (isSkipped) skipped += 1;
    else if (isCorrect) correct += 1;
    else wrong += 1;

    items.push({
      index: i,
      questionId: qid,
      subject: q.subject ?? null,
      topic: q.topic ?? null,
      section: q.section ?? null,
      difficulty: q.difficulty ?? null,
      type,
      marks,
      negMarks,
      answerGiven: given,
      correctAnswer: correctRaw,
      isCorrect,
      isWrong,
      isSkipped,
      marksAwarded,
      negAwarded,
    });
  }

  const attempted = qs.length - skipped;

  return {
    items,
    totals: { correct, wrong, skipped, attempted, total: qs.length },
  };
}
