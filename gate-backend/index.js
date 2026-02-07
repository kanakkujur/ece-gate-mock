// FILE: index.js
import "dotenv/config";

import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pg from "pg";

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
/**
 * key -> { expiresAt:number, value:any }
 */
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

// ----------- Random helpers -----------
function randInt(min, max) {
  // inclusive
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Builds a blueprint for "main" test:
 * total=65, GE=10 fixed, EC=55.
 *
 * per-subject count 1..5. With 10 EC subjects, max is 50 so add EC_MIXED filler.
 */
const MAIN_EC_SUBJECTS = [
  "Engineering Mathematics",
  "Networks",
  "Signals and Systems",
  "Electronic Devices",
  "Analog Circuits",
  "Digital Electronics",
  "Control Systems",
  "Communication",
  "Electromagnetics",
  "Computer Organization",
];

function buildMainBlueprint({ total = 65, geCount = 10, minPerSubject = 1, maxPerSubject = 5 } = {}) {
  const ecTotal = total - geCount;

  const dist = {};
  let sum = 0;
  for (const s of MAIN_EC_SUBJECTS) {
    const n = randInt(minPerSubject, maxPerSubject);
    dist[s] = n;
    sum += n;
  }

  while (sum > ecTotal) {
    const pick = MAIN_EC_SUBJECTS[randInt(0, MAIN_EC_SUBJECTS.length - 1)];
    if (dist[pick] > minPerSubject) {
      dist[pick] -= 1;
      sum -= 1;
    }
  }

  const remainder = ecTotal - sum;
  if (remainder > 0) dist["EC_MIXED"] = remainder;

  return {
    mode: "main",
    total,
    GE: geCount,
    EC: ecTotal,
    perSubject: dist,
    constraints: { minPerSubject, maxPerSubject },
  };
}

/**
 * Choose a mix of question types.
 */
function defaultTypeMix(count) {
  const mcq = Math.max(0, Math.round(count * 0.6));
  const msq = Math.max(0, Math.round(count * 0.2));
  let nat = count - mcq - msq;
  if (nat < 0) nat = 0;
  return { MCQ: mcq, MSQ: msq, NAT: nat };
}

function normalizeDifficulty(v) {
  const x = String(v || "").toLowerCase().trim();
  return x === "easy" || x === "medium" || x === "hard" ? x : "medium";
}

/* -------------------------
   Health
------------------------- */
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
   POST /api/ai/generate
   GET  /api/ai/blueprint
========================================================= */

// Returns a randomized blueprint (preview distribution)
app.get("/api/ai/blueprint", authMiddleware, async (req, res) => {
  const mode = (req.query.mode || "main").toString().toLowerCase();
  if (mode !== "main") return res.status(400).json({ error: "Only mode=main supported for blueprint right now" });

  const minPerSubject = Math.max(1, parseInt(req.query.minPerSubject || "1", 10) || 1);
  const maxPerSubject = Math.max(minPerSubject, parseInt(req.query.maxPerSubject || "5", 10) || 5);

  const blueprint = buildMainPaperPlan({ minPerSubject, maxPerSubject });
  res.json(blueprint);
});

// Provider resolver
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

// Small helper: hard-trim or pad a question list to desired length
function coerceCount(qs, desired) {
  const arr = Array.isArray(qs) ? qs.slice(0) : [];
  if (arr.length > desired) return arr.slice(0, desired);
  return arr; // if short, caller decides how to fill
}

// STAGE-6C: Start MAIN test with difficulty
app.post("/api/test/start-main", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    const difficulty = normalizeDifficulty(req.body?.difficulty || "medium"); // easy|medium|hard

    // TODO Stage-6C flow:
    // 1) Build randomized blueprint for 65 (10 GE + 55 EC)
    // 2) Ensure DB has enough questions per bucket (difficulty/section/subject)
    //    - If insufficient: call /api/ai/generate mode=main to generate missing
    //    - Import into questions table with question_hash dedupe
    // 3) Create a new test_session row (is_submitted=false, mode=main, totalquestions=65)
    // 4) Pick final 65 questions with rule: 40% previously seen, 60% new
    // 5) Insert usage rows into question_usage(user_id, question_id, test_id)
    // 6) Return { testId, questions, blueprint }

    return res.status(501).json({ error: "Stage-6C start-main not implemented yet" });
  } catch (e) {
    console.error("start-main error:", e);
    return res.status(500).json({ error: "Failed to start main test" });
  }
});


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

    // difficulty for BOTH modes
    const diff = normalizeDifficulty(req.body?.difficulty);

    // ---------- SUBJECT MODE ----------
    if (mode === "subject") {
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

      // Stage-6C hardening: ensure difficulty is correct on every question
      if (Array.isArray(data?.questions)) {
        for (const q of data.questions) q.difficulty = diff;
      }

      cacheSet(cacheKey, data);
      return res.json(data);
    }

    // ---------- MAIN MODE ----------
    if (mode === "main") {
      const blueprint =
        req.body?.blueprint ||
        buildMainBlueprint({
          minPerSubject: req.body?.minPerSubject ?? 1,
          maxPerSubject: req.body?.maxPerSubject ?? 5,
        });

      const perSubject = blueprint?.perSubject || {};
      const geCount = blueprint?.GE ?? 10;
      const totalTarget = blueprint?.total ?? 65;

      // 1) Generate GE
      const gePayload = {
        mode: "subject",
        subject: "General Aptitude",
        topic: req.body?.geTopic || "Mixed",
        count: geCount,
        typeMix: defaultTypeMix(geCount),
        difficulty: diff,
      };

      // 2) Generate EC subject chunks
      const subjectPayloads = [];
      for (const [sub, cnt] of Object.entries(perSubject)) {
        const n = parseInt(cnt, 10) || 0;
        if (n <= 0) continue;

        subjectPayloads.push({
          mode: "subject",
          subject: sub === "EC_MIXED" ? "EC_MIXED" : sub,
          topic: "Mixed",
          count: n,
          typeMix: defaultTypeMix(n),
          difficulty: diff,
        });
      }

      const geOut = await runProvider(provider, gePayload);
      const geQsRaw = geOut?.questions || [];
      const geQs = coerceCount(geQsRaw, geCount).map((q) => ({
        ...q,
        difficulty: diff,
        section: "GE",
        subject: q?.subject || "General Aptitude",
      }));

      const ecParts = [];
      for (const p of subjectPayloads) {
        const part = await runProvider(provider, p);
        const qsRaw = part?.questions || [];
        const qs = coerceCount(qsRaw, p.count).map((q) => ({
          ...q,
          difficulty: diff,
          section: "EC",
          subject: q?.subject || p.subject,
          topic: q?.topic || "Mixed",
        }));
        ecParts.push({ subject: p.subject, want: p.count, got: qs.length, questions: qs });
      }

      // Merge + harden total count
      const all = [];
      all.push(...geQs);
      for (const part of ecParts) all.push(...part.questions);

      // If under target (rare), fill by requesting extra EC_MIXED
      if (all.length < totalTarget) {
        const missing = totalTarget - all.length;

        const fillerPayload = {
          mode: "subject",
          subject: "EC_MIXED",
          topic: "Mixed",
          count: missing,
          typeMix: defaultTypeMix(missing),
          difficulty: diff,
        };

        const filler = await runProvider(provider, fillerPayload);
        const fillerQs = coerceCount(filler?.questions || [], missing).map((q) => ({
          ...q,
          difficulty: diff,
          section: "EC",
          subject: q?.subject || "EC_MIXED",
          topic: q?.topic || "Mixed",
        }));
        all.push(...fillerQs);
      }

      // If over target, trim
      const finalQs = all.slice(0, totalTarget);

      // Final assertion (Stage-6C safety)
      const result = {
        provider,
        mode: "main",
        blueprint,
        difficulty: diff,
        totalQuestions: finalQs.length,
        questions: finalQs,
        _debug: {
          geRequested: geCount,
          geReturned: geQs.length,
          ecPlan: ecParts.map((x) => ({ subject: x.subject, want: x.want, got: x.got })),
        },
      };

      cacheSet(cacheKey, result);
      return res.json(result);
    }

    return res.status(400).json({ error: "mode must be subject|main" });
  } catch (e) {
    console.error("AI error:", e);
    return res.status(500).json({ error: "AI generation failed", detail: e?.message || String(e) });
  }
});

/* =========================================================
   TEST API (DB questions bank)
========================================================= */

app.get("/api/test/generate", authMiddleware, async (req, res) => {
  try {
    const subjectsParam = (req.query.subjects || "").toString().trim();
    const count = Math.max(1, Math.min(parseInt(req.query.count || "10", 10) || 10, 100));

    let rows;
    if (subjectsParam) {
      const subjects = subjectsParam.split(",").map((s) => s.trim()).filter(Boolean);
      rows = await pool.query(
        `SELECT id, subject, topic, type, marks, neg_marks, question, options, answer, solution, source, year, paper, session, question_number
         FROM questions
         WHERE subject = ANY($1)
         ORDER BY random()
         LIMIT $2`,
        [subjects, count]
      );
    } else {
      rows = await pool.query(
        `SELECT id, subject, topic, type, marks, neg_marks, question, options, answer, solution, source, year, paper, session, question_number
         FROM questions
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
   TEST SESSION HARDENING (STAGE 4)
========================================================= */

app.get("/api/test/active", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;

    const r = await pool.query(
      `SELECT id, user_id, answers, remaining_time, is_submitted, mode, subject, totalquestions, created_at
       FROM test_sessions
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

    const {
      answers = {},
      remainingTime = null,
      mode = "main",
      subject = null,
      totalQuestions = 65,
    } = req.body || {};

    const active = await pool.query(
      `SELECT id
       FROM test_sessions
       WHERE user_id = $1 AND is_submitted = false
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (active.rows.length) {
      const sid = active.rows[0].id;

      const upd = await pool.query(
        `UPDATE test_sessions
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
      `INSERT INTO test_sessions (user_id, answers, remaining_time, is_submitted, mode, subject, totalquestions, created_at)
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
       FROM test_sessions
       WHERE user_id = $1 AND is_submitted = false
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (active.rows.length) {
      const sid = active.rows[0].id;

      const upd = await pool.query(
        `UPDATE test_sessions
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
        [
          sid,
          score,
          accuracy,
          JSON.stringify(answers),
          totalQuestions,
          remainingTime || 0,
          mode,
          subject,
        ]
      );

      return res.json({ ok: true, id: upd.rows[0].id, action: "updated_active_submitted" });
    }

    const ins = await pool.query(
      `INSERT INTO test_sessions (user_id, score, accuracy, answers, totalquestions, remaining_time, is_submitted, mode, subject, created_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,true,$7,$8,now())
       RETURNING id`,
      [
        userId,
        score,
        accuracy,
        JSON.stringify(answers),
        totalQuestions,
        remainingTime || 0,
        mode,
        subject,
      ]
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
       FROM test_sessions
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
   QUESTIONS (Import AI-generated questions into DB)
========================================================= */

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

app.post("/api/questions/import", authMiddleware, async (req, res) => {
  try {
    const body = req.body || {};
    const questions = Array.isArray(body.questions) ? body.questions : [];

    if (!questions.length) return res.status(400).json({ error: "questions[] is required" });
    if (questions.length > 200) return res.status(400).json({ error: "Max 200 questions per import" });

    const rows = questions.map((q, idx) => {
      const defaultSubject = String(body.defaultSubject || body.subject || "").trim();
      const defaultTopic = String(body.defaultTopic || body.topic || "Mixed").trim();

      const subject = String(q.subject || defaultSubject || "").trim();
      const topic = String(q.topic || defaultTopic || "Mixed").trim();

      const type = sanitizeType(q.type);

      const question = String(q.question || "").trim();
      const answer = q.answer == null ? "" : String(q.answer).trim();
      const solution = String(q.solution || "").trim();

      if (!subject) throw new Error(`Row ${idx + 1}: subject missing`);
      if (!question) throw new Error(`Row ${idx + 1}: question missing`);

      let options = null;
      if (type !== "NAT") {
        if (!isPlainObject(q.options)) throw new Error(`Row ${idx + 1}: options object required for ${type}`);
        options = q.options;
      } else {
        if (isPlainObject(q.options)) options = q.options;
      }

      const marks = asNum(q.marks, 1);
      const neg_marks = asNum(q.neg_marks, 0.33);

      const source = String(q.source || "AI").trim();

      const year = q.year == null || q.year === "" ? null : Number(q.year);
      const paper = q.paper == null ? null : String(q.paper);
      const session = q.session == null ? null : String(q.session);
      const question_number = q.question_number == null || q.question_number === "" ? null : Number(q.question_number);

      return {
        subject,
        topic,
        type,
        marks,
        neg_marks,
        question,
        options,
        answer,
        solution,
        source,
        year,
        paper,
        session,
        question_number,
      };
    });

    const cols = [
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
      ph[6] = `${ph[6]}::jsonb`;
      return `(${ph.join(",")})`;
    });

    const sql = `
      INSERT INTO questions (${cols.join(",")})
      VALUES ${placeholders.join(",")}
      RETURNING id
    `;

    const out = await pool.query(sql, values);
    return res.json({ ok: true, inserted: out.rowCount, ids: out.rows.map((x) => x.id) });
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
