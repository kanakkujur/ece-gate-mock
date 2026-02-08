// FILE: gate-backend/index.js
import "dotenv/config";

import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pg from "pg";
import crypto from "crypto";
import { GE_SUBJECTS, EC_SUBJECTS } from "./src/constants/subjects.js";

import { generateQuestions as generateOpenAIQuestions } from "./aiProviders/openai.js";
import { generateQuestions as generateLocalQuestions } from "./aiProviders/local.js";
import { buildMainPaperPlan } from "./src/randomizer.js";

const { Pool } = pg;
const app = express();

app.use(cors({ origin: "*", credentials: false }));
app.use(express.json({ limit: "4mb" }));

/* -------------------------
   DB
------------------------- */
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL missing in env");
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/* -------------------------
   Config
------------------------- */
const JWT_SECRET = process.env.JWT_SECRET || "change-me";
const PASSWORD_COLUMN_RAW = (process.env.PASSWORD_COLUMN || "password_hash").toLowerCase();
const ALLOWED_PASSWORD_COLUMNS = new Set(["password_hash", "password", "hash"]);
const PASSWORD_COLUMN = ALLOWED_PASSWORD_COLUMNS.has(PASSWORD_COLUMN_RAW)
  ? PASSWORD_COLUMN_RAW
  : "password_hash";

const DEFAULT_AI_PROVIDER = (process.env.AI_PROVIDER || "openai").toLowerCase(); // auto|openai|local
const AI_CACHE_TTL_MS = parseInt(process.env.AI_CACHE_TTL_MS || "", 10) || 24 * 60 * 60 * 1000; // 24h

/* -------------------------
   Helpers
------------------------- */
function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid/expired token" });
  }
}

// ----------- Simple TTL Cache (in-memory) -----------
const aiCache = new Map();
/** key -> { expiresAt:number, value:any } */
function cacheGet(key) {
  const v = aiCache.get(key);
  if (!v) return null;
  if (Date.now() > v.expiresAt) {
    aiCache.delete(key);
    return null;
  }
  return v.value;
}
function cacheSet(key, value) {
  aiCache.set(key, { expiresAt: Date.now() + AI_CACHE_TTL_MS, value });
}

// ----------- Normalize helpers -----------
function normalizeDifficulty(v) {
  const x = String(v || "").toLowerCase().trim();
  return x === "easy" || x === "medium" || x === "hard" ? x : "medium";
}
function normalizeSection(v) {
  const x = String(v || "").toUpperCase().trim();
  return x === "GE" || x === "EC" ? x : "EC";
}
function sanitizeType(t) {
  const x = String(t || "").toUpperCase();
  if (x === "MCQ" || x === "MSQ" || x === "NAT") return x;
  return "MCQ";
}
function asNum(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function isPlainObject(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

/** Choose a mix of question types */
function defaultTypeMix(count) {
  const mcq = Math.max(0, Math.round(count * 0.6));
  const msq = Math.max(0, Math.round(count * 0.2));
  let nat = count - mcq - msq;
  if (nat < 0) nat = 0;
  return { MCQ: mcq, MSQ: msq, NAT: nat };
}

/** Force strings to single-line (prevents console wrapping due to embedded newlines/tabs) */
function oneLine(s, max = 160) {
  return String(s ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .slice(0, max)
    .trim();
}

/* =========================================================
   Stage-6C Option B: Progress Jobs (polling)
   In-memory store (OK for localhost). For prod: DB/Redis.
========================================================= */
const progressJobs = new Map();
/**
 * jobId -> {
 *   status: "running"|"done"|"error",
 *   percent: number (0..100),
 *   step: string,
 *   startedAt: number,
 *   updatedAt: number,
 *   generatedInserted?: number,
 *   generatedTarget?: number,
 *   generatedBucketsDone?: number,
 *   generatedBucketsTotal?: number,
 *   result?: any,
 *   error?: string
 * }
 */
function newJobId() {
  return `job_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function jobSet(jobId, patch) {
  const cur = progressJobs.get(jobId) || {
    status: "running",
    percent: 0,
    step: "starting",
    startedAt: Date.now(),
    updatedAt: Date.now(),
    generatedInserted: 0,
    generatedTarget: 0,
    generatedBucketsDone: 0,
    generatedBucketsTotal: 0,
  };

  const next = {
    ...cur,
    ...patch,
    step: oneLine(patch.step ?? cur.step),
    updatedAt: Date.now(),
  };

  if (typeof next.percent === "number") {
    next.percent = Math.max(0, Math.min(100, next.percent));
  }

  for (const k of [
    "generatedInserted",
    "generatedTarget",
    "generatedBucketsDone",
    "generatedBucketsTotal",
  ]) {
    next[k] = Math.max(0, Number(next[k]) || 0);
  }

  progressJobs.set(jobId, next);
  return next;
}

// cleanup old jobs (keep 30 mins)
setInterval(() => {
  const now = Date.now();
  for (const [jobId, j] of progressJobs.entries()) {
    if (now - (j.updatedAt || j.startedAt || now) > 30 * 60 * 1000) {
      progressJobs.delete(jobId);
    }
  }
}, 60 * 1000);

// Poll status: GET /api/test/start-main/status?jobId=...
app.get("/api/test/start-main/status", authMiddleware, async (req, res) => {
  const jobId = String(req.query.jobId || "").trim();
  if (!jobId) return res.status(400).json({ error: "jobId is required" });

  const j = progressJobs.get(jobId);
  if (!j) return res.status(404).json({ error: "job not found" });

  const out = {
    jobId,
    status: j.status,
    percent: j.percent,
    step: j.step,
    startedAt: j.startedAt,
    updatedAt: j.updatedAt,
    generatedInserted: j.generatedInserted || 0,
    generatedTarget: j.generatedTarget || 0,
    generatedBucketsDone: j.generatedBucketsDone || 0,
    generatedBucketsTotal: j.generatedBucketsTotal || 0,
  };

  if (j.status === "done") out.result = j.result;
  if (j.status === "error") out.error = j.error;

  return res.json(out);
});

/* =========================================================
   DEDUPE HASH (Stage-6C)
========================================================= */
function stableOptionsString(options) {
  if (!options || typeof options !== "object") return "";
  const keys = Object.keys(options).sort();
  const obj = {};
  for (const k of keys) obj[k] = String(options[k] ?? "").trim();
  return JSON.stringify(obj);
}

function normalizeAnswerForHash(type, answer) {
  const t = sanitizeType(type);
  if (t === "MSQ") {
    if (Array.isArray(answer)) return answer.map((x) => String(x).trim()).filter(Boolean).sort().join(",");
    return String(answer ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .sort()
      .join(",");
  }
  if (t === "NAT") return String(answer ?? "").trim();
  return String(answer ?? "").trim();
}

/**
 * question_hash includes difficulty+section+subject+topic+type+question+options+answer
 */
function computeQuestionHash(q) {
  const section = normalizeSection(q.section || "EC");
  const difficulty = normalizeDifficulty(q.difficulty || "medium");
  const subject = String(q.subject || "").trim();
  const topic = String(q.topic || "Mixed").trim();
  const type = sanitizeType(q.type);
  const question = String(q.question || "").trim();
  const optionsStr = type === "NAT" ? "" : stableOptionsString(q.options);
  const answerStr = normalizeAnswerForHash(type, q.answer);

  const base = [
    `section=${section}`,
    `difficulty=${difficulty}`,
    `subject=${subject}`,
    `topic=${topic}`,
    `type=${type}`,
    `q=${question}`,
    `opt=${optionsStr}`,
    `ans=${answerStr}`,
  ].join("|");

  return crypto.createHash("sha256").update(base, "utf8").digest("hex");
}

/* =========================================================
   AI Provider resolver
========================================================= */
async function runProvider(provider, payload) {
  if (provider === "openai") return await generateOpenAIQuestions(payload);
  if (provider === "local") return await generateLocalQuestions(payload);

  if (provider === "auto") {
    try {
      return await generateOpenAIQuestions(payload);
    } catch {
      return await generateLocalQuestions(payload);
    }
  }
  throw new Error("provider must be openai|local|auto");
}

/* =========================================================
   Health
========================================================= */
app.get("/api", (req, res) => res.json({ status: "GATE backend running" }));

/* =========================================================
   AUTH
========================================================= */
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email/password required" });

    const exists = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
    if (exists.rows.length) return res.status(409).json({ error: "Email already registered" });

    const hash = await bcrypt.hash(password, 10);
    const insertSql = `INSERT INTO users (email, ${PASSWORD_COLUMN})
                       VALUES ($1, $2)
                       RETURNING id, email`;
    const r = await pool.query(insertSql, [email, hash]);

    const user = r.rows[0];
    const token = signToken(user);
    res.json({ user, token });
  } catch (e) {
    console.error("Signup error:", e);
    res.status(500).json({ error: "Signup failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email/password required" });

    const sql = `SELECT id, email, ${PASSWORD_COLUMN} AS pw FROM users WHERE email=$1`;
    const r = await pool.query(sql, [email]);

    const user = r.rows[0];
    if (!user || !user.pw) return res.status(401).json({ error: "Invalid email or password" });

    const ok = await bcrypt.compare(password, user.pw);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    const token = signToken({ id: user.id, email: user.email });
    res.json({ user: { id: user.id, email: user.email }, token });
  } catch (e) {
    console.error("Login error:", e);
    res.status(500).json({ error: "Login failed" });
  }
});

/* =========================================================
   AI
   GET  /api/ai/blueprint
========================================================= */
app.get("/api/ai/blueprint", authMiddleware, async (req, res) => {
  const mode = (req.query.mode || "main").toString().toLowerCase();
  if (mode !== "main") return res.status(400).json({ error: "Only mode=main supported for blueprint right now" });

  const minPerSubject = Math.max(1, parseInt(req.query.minPerSubject || "1", 10) || 1);
  const maxPerSubject = Math.max(minPerSubject, parseInt(req.query.maxPerSubject || "5", 10) || 5);

  const blueprint = buildMainPaperPlan({ minPerSubject, maxPerSubject });
  res.json(blueprint);
});

/* =========================================================
   Stage-6C DB helpers
========================================================= */
async function countAvailable({ section, subject, difficulty }) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM public.questions
     WHERE section=$1 AND subject=$2 AND difficulty=$3`,
    [section, subject, difficulty]
  );
  return r.rows[0]?.c ?? 0;
}

/**
 * Bulk import with dedupe by question_hash.
 * Uses ON CONFLICT DO NOTHING.
 */
async function importQuestionsWithDedupe(questions, { section, difficulty }) {
  const qs = Array.isArray(questions) ? questions : [];
  if (!qs.length) return { inserted: 0, ids: [] };

  const rows = qs.map((q, idx) => {
    const type = sanitizeType(q.type);

    const subject = String(q.subject || "").trim();
    const topic = String(q.topic || "Mixed").trim();
    const question = String(q.question || "").trim();
    if (!subject) throw new Error(`Row ${idx + 1}: subject missing`);
    if (!question) throw new Error(`Row ${idx + 1}: question missing`);

    let options = null;
    if (type !== "NAT") {
      if (!isPlainObject(q.options)) throw new Error(`Row ${idx + 1}: options object required for ${type}`);
      options = q.options;
    }

    let answer = q.answer;
    if (type === "MSQ") {
      answer = Array.isArray(answer)
        ? answer.map((x) => String(x).trim()).filter(Boolean).sort().join(",")
        : String(answer ?? "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
            .sort()
            .join(",");
    } else if (type === "NAT") {
      answer = answer == null ? "" : String(answer).trim();
    } else {
      answer = String(answer ?? "").trim();
    }

    const row = {
      section: normalizeSection(section || q.section || "EC"),
      difficulty: normalizeDifficulty(difficulty || q.difficulty || "medium"),
      subject,
      topic,
      type,
      marks: asNum(q.marks, 1),
      neg_marks: asNum(q.neg_marks, 0.33),
      question,
      options,
      answer,
      solution: String(q.solution || "").trim(),
      source: String(q.source || "AI").trim(),
      year: q.year == null || q.year === "" ? null : Number(q.year),
      paper: q.paper == null ? null : String(q.paper),
      session: q.session == null ? null : String(q.session),
      question_number: q.question_number == null || q.question_number === "" ? null : Number(q.question_number),
    };

    row.question_hash = computeQuestionHash(row);
    return row;
  });

  const cols = [
    "question_hash",
    "difficulty",
    "section",
    "subject",
    "topic",
    "type",
    "marks",
    "neg_marks",
    "question",
    "options",
    "answer",
    "solution",
    "source",
    "year",
    "paper",
    "session",
    "question_number",
  ];

  const values = [];
  const placeholders = rows.map((r, i) => {
    const base = i * cols.length;
    values.push(
      r.question_hash,
      r.difficulty,
      r.section,
      r.subject,
      r.topic,
      r.type,
      r.marks,
      r.neg_marks,
      r.question,
      r.options ? JSON.stringify(r.options) : null,
      r.answer,
      r.solution,
      r.source,
      r.year,
      r.paper,
      r.session,
      r.question_number
    );
    const ph = cols.map((_, j) => `$${base + j + 1}`);
    ph[9] = `${ph[9]}::jsonb`;
    return `(${ph.join(",")})`;
  });

  const sql = `
    INSERT INTO public.questions (${cols.join(",")})
    VALUES ${placeholders.join(",")}
    ON CONFLICT DO NOTHING
    RETURNING id
  `;

  const out = await pool.query(sql, values);
  return { inserted: out.rowCount, ids: out.rows.map((x) => x.id) };
}

async function ensureDBHasQuestions({ provider, section, subject, difficulty, needMin }) {
  const have = await countAvailable({ section, subject, difficulty });
  const missing = Math.max(0, needMin - have);
  if (missing <= 0) return { have, needMin, missing: 0, generated: 0, haveAfter: have };

  const payload = {
    mode: "subject",
    section,
    subject,
    topic: "Mixed",
    count: missing,
    typeMix: defaultTypeMix(missing),
    difficulty,
  };

  const gen = await runProvider(provider, payload);
  const genQs = Array.isArray(gen?.questions) ? gen.questions : [];

  const ins = await importQuestionsWithDedupe(genQs, { section, difficulty });
  const haveAfter = have + ins.inserted;

  return { have, needMin, missing, generated: ins.inserted, haveAfter };
}

// Helpers for 40/60 split
function split4060(n) {
  const wantSeen = Math.floor(n * 0.4);
  const wantNew = n - wantSeen;
  return { wantSeen, wantNew };
}

// Pull “seen” and “new” from DB for a bucket
async function pickFromDBForBucket({ userId, section, subject, difficulty, want }) {
  const { wantSeen, wantNew } = split4060(want);

  const seenRows = await pool.query(
    `
    SELECT q.id, q.subject, q.topic, q.type, q.marks, q.neg_marks, q.question, q.options, q.answer, q.solution,
           q.source, q.year, q.paper, q.session, q.question_number, q.section, q.difficulty
    FROM public.questions q
    WHERE q.section=$2 AND q.subject=$3 AND q.difficulty=$4
      AND EXISTS (
        SELECT 1 FROM public.question_usage u
        WHERE u.user_id=$1 AND u.question_id=q.id
      )
    ORDER BY random()
    LIMIT $5
    `,
    [userId, section, subject, difficulty, wantSeen]
  );

  const newRows = await pool.query(
    `
    SELECT q.id, q.subject, q.topic, q.type, q.marks, q.neg_marks, q.question, q.options, q.answer, q.solution,
           q.source, q.year, q.paper, q.session, q.question_number, q.section, q.difficulty
    FROM public.questions q
    WHERE q.section=$2 AND q.subject=$3 AND q.difficulty=$4
      AND NOT EXISTS (
        SELECT 1 FROM public.question_usage u
        WHERE u.user_id=$1 AND u.question_id=q.id
      )
    ORDER BY random()
    LIMIT $5
    `,
    [userId, section, subject, difficulty, wantNew]
  );

  let picked = [...(seenRows.rows || []), ...(newRows.rows || [])];

  if (picked.length < want) {
    const need = want - picked.length;
    const ids = picked.map((x) => x.id);

    const moreNew = await pool.query(
      `
      SELECT q.id, q.subject, q.topic, q.type, q.marks, q.neg_marks, q.question, q.options, q.answer, q.solution,
             q.source, q.year, q.paper, q.session, q.question_number, q.section, q.difficulty
      FROM public.questions q
      WHERE q.section=$2 AND q.subject=$3 AND q.difficulty=$4
        AND NOT EXISTS (
          SELECT 1 FROM public.question_usage u
          WHERE u.user_id=$1 AND u.question_id=q.id
        )
        AND ($6::int[] IS NULL OR q.id <> ALL($6::int[]))
      ORDER BY random()
      LIMIT $5
      `,
      [userId, section, subject, difficulty, need, ids.length ? ids : null]
    );
    picked.push(...(moreNew.rows || []));
  }

  if (picked.length < want) {
    const need = want - picked.length;
    const ids = picked.map((x) => x.id);

    const moreSeen = await pool.query(
      `
      SELECT q.id, q.subject, q.topic, q.type, q.marks, q.neg_marks, q.question, q.options, q.answer, q.solution,
             q.source, q.year, q.paper, q.session, q.question_number, q.section, q.difficulty
      FROM public.questions q
      WHERE q.section=$2 AND q.subject=$3 AND q.difficulty=$4
        AND EXISTS (
          SELECT 1 FROM public.question_usage u
          WHERE u.user_id=$1 AND u.question_id=q.id
        )
        AND ($6::int[] IS NULL OR q.id <> ALL($6::int[]))
      ORDER BY random()
      LIMIT $5
      `,
      [userId, section, subject, difficulty, need, ids.length ? ids : null]
    );
    picked.push(...(moreSeen.rows || []));
  }

  if (picked.length < want) {
    const need = want - picked.length;
    const ids = picked.map((x) => x.id);

    const any = await pool.query(
      `
      SELECT q.id, q.subject, q.topic, q.type, q.marks, q.neg_marks, q.question, q.options, q.answer, q.solution,
             q.source, q.year, q.paper, q.session, q.question_number, q.section, q.difficulty
      FROM public.questions q
      WHERE q.section=$1 AND q.subject=$2 AND q.difficulty=$3
        AND ($4::int[] IS NULL OR q.id <> ALL($4::int[]))
      ORDER BY random()
      LIMIT $5
      `,
      [section, subject, difficulty, ids.length ? ids : null, need]
    );
    picked.push(...(any.rows || []));
  }

  return { picked: picked.slice(0, want) };
}

// Insert usage rows for the started test
async function recordUsage({ userId, testId, questionIds }) {
  if (!questionIds.length) return 0;

  const values = [];
  const placeholders = questionIds.map((qid, i) => {
    values.push(userId, qid, testId);
    const b = i * 3;
    return `($${b + 1}, $${b + 2}, $${b + 3})`;
  });

  const sql = `
    INSERT INTO public.question_usage (user_id, question_id, test_id)
    VALUES ${placeholders.join(",")}
    ON CONFLICT (user_id, question_id, test_id) DO NOTHING
  `;

  const out = await pool.query(sql, values);
  return out.rowCount;
}

/* =========================================================
   Stage-6C: Start MAIN test with difficulty (Option B jobs)
   POST /api/test/start-main { difficulty }
========================================================= */
app.post("/api/test/start-main", authMiddleware, async (req, res) => {
  const userId = req.user?.id;
  const difficulty = normalizeDifficulty(req.body?.difficulty || "medium");

  const jobId = newJobId();
  jobSet(jobId, {
    status: "running",
    percent: 0,
    step: "Job created",
    generatedInserted: 0,
    generatedTarget: 0,
    generatedBucketsDone: 0,
    generatedBucketsTotal: 0,
  });

  res.json({ ok: true, jobId });

  (async () => {
    try {
      jobSet(jobId, { percent: 5, step: "Building blueprint" });

      const seedStr = `${userId}:${new Date().toISOString().slice(0, 10)}:main`;
      const blueprint = buildMainPaperPlan({
        seedStr,
        minPerSubject: 1,
        maxPerSubject: 5,
        addMixedBucket: true,
      });

      // Build pool requirements list first (for target estimate)
      const reqs = [];
      const geNeedMin = Math.max(80, (blueprint.GE || 10) * 8);
      reqs.push({ section: "GE", subject: "General Aptitude", needMin: geNeedMin });

      for (const [sub, cnt] of Object.entries(blueprint.EC || {})) {
        const want = parseInt(cnt, 10) || 0;
        if (want <= 0) continue;
        const needMin = Math.max(120, want * 10);
        reqs.push({ section: "EC", subject: sub, needMin });
      }

      jobSet(jobId, {
        generatedBucketsTotal: reqs.length,
        generatedBucketsDone: 0,
      });

      jobSet(jobId, { percent: 10, step: "Estimating generation target" });

      let targetMissing = 0;
      for (const r of reqs) {
        const have = await countAvailable({ section: r.section, subject: r.subject, difficulty });
        targetMissing += Math.max(0, r.needMin - have);
      }

      jobSet(jobId, {
        generatedTarget: targetMissing,
        generatedInserted: 0,
        percent: 12,
        step: `Estimated generation target: ${targetMissing}`,
      });

      jobSet(jobId, { percent: 15, step: "Ensuring DB question pools (GE)" });

      let insertedSoFar = 0;
      let bucketsDone = 0;

      // GE
      {
        const stats = await ensureDBHasQuestions({
          provider: DEFAULT_AI_PROVIDER,
          section: "GE",
          subject: "General Aptitude",
          difficulty,
          needMin: geNeedMin,
        });

        insertedSoFar += stats.generated;
        bucketsDone += 1;

        jobSet(jobId, {
          percent: 25,
          generatedInserted: insertedSoFar,
          generatedBucketsDone: bucketsDone,
          step: `GE pool: have=${stats.have} → need=${geNeedMin}, missing=${stats.missing}, inserted=${stats.generated}`,
        });
      }

      // EC
      jobSet(jobId, { percent: 35, step: "Ensuring DB question pools (EC subjects)" });

      const entries = Object.entries(blueprint.EC || {});
      for (let i = 0; i < entries.length; i++) {
        const [sub, cnt] = entries[i];
        const want = parseInt(cnt, 10) || 0;
        if (want <= 0) continue;

        const needMin = Math.max(120, want * 10);

        const base = 35;
        const span = 30; // 35 -> 65
        const p = base + Math.round((i / Math.max(1, entries.length)) * span);

        jobSet(jobId, { percent: p, step: `Ensuring DB pool: ${sub}` });

        const stats = await ensureDBHasQuestions({
          provider: DEFAULT_AI_PROVIDER,
          section: "EC",
          subject: sub,
          difficulty,
          needMin,
        });

        insertedSoFar += stats.generated;
        bucketsDone += 1;

        jobSet(jobId, {
          percent: p,
          generatedInserted: insertedSoFar,
          generatedBucketsDone: bucketsDone,
          step: `EC pool ${sub}: have=${stats.have} → need=${needMin}, missing=${stats.missing}, inserted=${stats.generated}`,
        });
      }

      jobSet(jobId, { percent: 70, step: "Creating test session row" });

      const ins = await pool.query(
        `
        INSERT INTO public.test_sessions (user_id, answers, remaining_time, is_submitted, mode, subject, totalquestions, created_at)
        VALUES ($1, '{}'::jsonb, $2, false, 'main', 'EC', 65, now())
        RETURNING id
        `,
        [userId, 60 * 60]
      );
      const testId = ins.rows[0].id;

      jobSet(jobId, { percent: 78, step: "Selecting questions from DB (40/60 rule)" });

      const picked = [];

      // GE
      {
        const r = await pickFromDBForBucket({
          userId,
          section: "GE",
          subject: "General Aptitude",
          difficulty,
          want: blueprint.GE || 10,
        });
        picked.push(...r.picked);
      }

      // EC
      for (const [sub, cnt] of Object.entries(blueprint.EC || {})) {
        const want = parseInt(cnt, 10) || 0;
        if (want <= 0) continue;

        const r = await pickFromDBForBucket({
          userId,
          section: "EC",
          subject: sub,
          difficulty,
          want,
        });
        picked.push(...r.picked);
      }

      let finalQs = picked.slice(0, 65);

      if (finalQs.length < 65) {
        jobSet(jobId, { percent: 85, step: "Top-up fill (rare)" });
        const missing = 65 - finalQs.length;

        const fill = await pool.query(
          `
          SELECT q.*
          FROM public.questions q
          WHERE q.section='EC' AND q.difficulty=$1
          ORDER BY random()
          LIMIT $2
          `,
          [difficulty, missing]
        );

        finalQs = finalQs.concat(fill.rows).slice(0, 65);
      }

      jobSet(jobId, { percent: 92, step: "Recording question_usage rows" });

      const qids = finalQs.map((x) => x.id).filter(Boolean);
      await recordUsage({ userId, testId, questionIds: qids });

      jobSet(jobId, {
        percent: 100,
        status: "done",
        step: "Done",
        result: { ok: true, testId, difficulty, blueprint, questions: finalQs },
      });
    } catch (e) {
      console.error("start-main job failed:", e);
      jobSet(jobId, {
        status: "error",
        step: "Failed",
        error: e?.message || String(e),
      });
    }
  })();
});

// GET /api/debug/db-stats
app.get("/api/debug/db-stats", authMiddleware, async (req, res) => {
  const difficulty = normalizeDifficulty(req.query.difficulty || "medium");

  const rows = await pool.query(
    `
    SELECT
      section,
      subject,
      difficulty,
      COUNT(*)::int AS total
    FROM public.questions
    WHERE difficulty = $1
    GROUP BY section, subject, difficulty
    ORDER BY section, subject
  `,
    [difficulty]
  );

  res.json({
    difficulty,
    total: rows.rows.reduce((a, r) => a + r.total, 0),
    buckets: rows.rows,
  });
});

/* =========================================================
   /api/ai/generate  (subject only)
========================================================= */
app.post("/api/ai/generate", authMiddleware, async (req, res) => {
  try {
    const provider = (req.body?.provider || DEFAULT_AI_PROVIDER).toLowerCase();
    const mode = (req.body?.mode || "subject").toLowerCase();

    const cacheKey = JSON.stringify({
      provider,
      mode,
      body: req.body,
      model: process.env.OPENAI_MODEL || process.env.LOCAL_LLM_MODEL || "",
    });

    const cached = cacheGet(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    const diff = normalizeDifficulty(req.body?.difficulty);

    if (mode !== "subject") {
      return res.status(400).json({ error: "mode must be subject (main is handled by /test/start-main)" });
    }

    const { subject, topic, count = 5 } = req.body || {};
    if (!subject || !topic) return res.status(400).json({ error: "subject and topic are required" });

    const n = Math.max(1, Math.min(parseInt(count, 10) || 5, 100));

    const payload = {
      mode: "subject",
      subject,
      topic,
      count: n,
      typeMix: defaultTypeMix(n),
      difficulty: diff,
    };

    const data = await runProvider(provider, payload);

    if (Array.isArray(data?.questions)) {
      for (const q of data.questions) q.difficulty = diff;
    }

    cacheSet(cacheKey, data);
    return res.json(data);
  } catch (e) {
    console.error("AI error:", e);
    return res.status(500).json({ error: "AI generation failed", detail: e?.message || String(e) });
  }
});

/* =========================================================
   TEST API (DB question bank quick pull)
========================================================= */
app.get("/api/test/generate", authMiddleware, async (req, res) => {
  try {
    const subjectsParam = (req.query.subjects || "").toString().trim();
    const count = Math.max(1, Math.min(parseInt(req.query.count || "10", 10) || 10, 100));

    let rows;
    if (subjectsParam) {
      const subjects = subjectsParam.split(",").map((s) => s.trim()).filter(Boolean);
      rows = await pool.query(
        `SELECT id, subject, topic, type, marks, neg_marks, question, options, answer, solution, source, year, paper, session, question_number, section, difficulty
         FROM public.questions
         WHERE subject = ANY($1)
         ORDER BY random()
         LIMIT $2`,
        [subjects, count]
      );
    } else {
      rows = await pool.query(
        `SELECT id, subject, topic, type, marks, neg_marks, question, options, answer, solution, source, year, paper, session, question_number, section, difficulty
         FROM public.questions
         ORDER BY random()
         LIMIT $1`,
        [count]
      );
    }

    res.json({ count: rows.rows.length, questions: rows.rows });
  } catch (e) {
    console.error("Generate error:", e);
    res.status(500).json({ error: "Failed to generate test" });
  }
});

/* =========================================================
   TEST SESSION (Stage 4)
========================================================= */
app.get("/api/test/active", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;

    const r = await pool.query(
      `SELECT id, user_id, answers, remaining_time, is_submitted, mode, subject, totalquestions, created_at
       FROM public.test_sessions
       WHERE user_id = $1 AND is_submitted = false
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    return res.json(r.rows[0] || null);
  } catch (e) {
    console.error("Active session error:", e);
    return res.status(500).json({ error: "Failed to load active session" });
  }
});

app.post("/api/test/autosave", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { answers = {}, remainingTime = null, mode = "main", subject = null, totalQuestions = 65 } = req.body || {};

    const active = await pool.query(
      `SELECT id
       FROM public.test_sessions
       WHERE user_id = $1 AND is_submitted = false
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (active.rows.length) {
      const sid = active.rows[0].id;

      const upd = await pool.query(
        `UPDATE public.test_sessions
         SET answers = $2::jsonb,
             remaining_time = $3,
             mode = $4,
             subject = $5,
             totalquestions = COALESCE($6, totalquestions)
         WHERE id = $1
         RETURNING id`,
        [sid, JSON.stringify(answers), remainingTime, mode, subject, totalQuestions]
      );

      return res.json({ ok: true, id: upd.rows[0].id, action: "updated" });
    }

    const ins = await pool.query(
      `INSERT INTO public.test_sessions (user_id, answers, remaining_time, is_submitted, mode, subject, totalquestions, created_at)
       VALUES ($1, $2::jsonb, $3, false, $4, $5, $6, now())
       RETURNING id`,
      [userId, JSON.stringify(answers), remainingTime, mode, subject, totalQuestions]
    );

    return res.json({ ok: true, id: ins.rows[0].id, action: "inserted" });
  } catch (e) {
    console.error("Autosave error:", e);
    return res.status(500).json({ error: "Autosave failed" });
  }
});

app.post("/api/test/submit", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;

    const {
      score = null,
      accuracy = null,
      answers = {},
      totalQuestions = null,
      mode = "main",
      subject = null,
      remainingTime = 0,
    } = req.body || {};

    const active = await pool.query(
      `SELECT id
       FROM public.test_sessions
       WHERE user_id = $1 AND is_submitted = false
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (active.rows.length) {
      const sid = active.rows[0].id;

      const upd = await pool.query(
        `UPDATE public.test_sessions
         SET score = $2,
             accuracy = $3,
             answers = $4::jsonb,
             totalquestions = COALESCE($5, totalquestions),
             remaining_time = $6,
             is_submitted = true,
             mode = $7,
             subject = $8
         WHERE id = $1
         RETURNING id`,
        [sid, score, accuracy, JSON.stringify(answers), totalQuestions, remainingTime || 0, mode, subject]
      );

      return res.json({ ok: true, id: upd.rows[0].id, action: "updated_active_submitted" });
    }

    const ins = await pool.query(
      `INSERT INTO public.test_sessions (user_id, score, accuracy, answers, totalquestions, remaining_time, is_submitted, mode, subject, created_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,true,$7,$8,now())
       RETURNING id`,
      [userId, score, accuracy, JSON.stringify(answers), totalQuestions, remainingTime || 0, mode, subject]
    );

    return res.json({ ok: true, id: ins.rows[0].id, action: "inserted_submitted" });
  } catch (e) {
    console.error("Submit error:", e);
    res.status(500).json({ error: "Failed to submit test" });
  }
});

app.get("/api/test/history", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    const r = await pool.query(
      `SELECT id, user_id, score, accuracy, answers, totalquestions, mode, subject, remaining_time, is_submitted, created_at
       FROM public.test_sessions
       WHERE user_id=$1
       ORDER BY created_at DESC`,
      [userId]
    );
    res.json(r.rows);
  } catch (e) {
    console.error("History error:", e);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

/* =========================================================
   QUESTIONS IMPORT (Stage-6C aware)
========================================================= */
app.post("/api/questions/import", authMiddleware, async (req, res) => {
  try {
    const body = req.body || {};
    const questions = Array.isArray(body.questions) ? body.questions : [];
    if (!questions.length) return res.status(400).json({ error: "questions[] is required" });
    if (questions.length > 200) return res.status(400).json({ error: "Max 200 questions per import" });

    const section = body.section ? normalizeSection(body.section) : null;
    const difficulty = normalizeDifficulty(body.difficulty || "medium");

    const out = await importQuestionsWithDedupe(questions, { section, difficulty });
    return res.json({ ok: true, inserted: out.inserted, ids: out.ids });
  } catch (e) {
    console.error("Import questions error:", e);
    return res.status(400).json({ error: e?.message || "Import failed" });
  }
});

/* -------------------------
   Start
------------------------- */
const PORT = process.env.PORT || 4000;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Backend running on port ${PORT}`);
  console.log(`Password column = ${PASSWORD_COLUMN}`);
});
