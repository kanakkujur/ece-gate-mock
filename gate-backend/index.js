import "dotenv/config";

import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pg from "pg";

import { generateQuestions as generateOpenAIQuestions } from "./aiProviders/openai.js";
import { generateQuestions as generateLocalQuestions } from "./aiProviders/local.js";
import { buildMainPaperPlan } from "./src/randomizer.js"

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
 * User requested per-subject count 1..5.
 * With 10 EC subjects, max is 50 (10*5), so we add "EC_MIXED" filler for leftover.
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

  // assign 1..5 to each EC subject
  const dist = {};
  let sum = 0;
  for (const s of MAIN_EC_SUBJECTS) {
    const n = randInt(minPerSubject, maxPerSubject);
    dist[s] = n;
    sum += n;
  }

  // if sum exceeds ecTotal, reduce randomly down to ecTotal while respecting min
  while (sum > ecTotal) {
    const pick = MAIN_EC_SUBJECTS[randInt(0, MAIN_EC_SUBJECTS.length - 1)];
    if (dist[pick] > minPerSubject) {
      dist[pick] -= 1;
      sum -= 1;
    }
  }

  // if sum is less than ecTotal, fill remainder into EC_MIXED
  const remainder = ecTotal - sum;
  if (remainder > 0) dist["EC_MIXED"] = remainder;

  return {
    mode: "main",
    total,
    GE: geCount,
    EC: ecTotal,
    perSubject: dist, // EC subjects + EC_MIXED (if needed)
    constraints: { minPerSubject, maxPerSubject },
  };
}

/**
 * Choose a mix of question types.
 * (You can tune these later; kept simple)
 */
function defaultTypeMix(count) {
  // Aim for ~60% MCQ, 20% MSQ, 20% NAT
  const mcq = Math.max(0, Math.round(count * 0.6));
  const msq = Math.max(0, Math.round(count * 0.2));
  let nat = count - mcq - msq;
  if (nat < 0) nat = 0;
  return { MCQ: mcq, MSQ: msq, NAT: nat };
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

// Returns a randomized blueprint (use this in UI / to preview distribution)
app.get("/api/ai/blueprint", authMiddleware, async (req, res) => {
  const mode = (req.query.mode || "main").toString().toLowerCase();
  if (mode !== "main") {
    return res.status(400).json({ error: "Only mode=main supported for blueprint right now" });
  }

  const minPerSubject = Math.max(1, parseInt(req.query.minPerSubject || "1", 10) || 1);
  const maxPerSubject = Math.max(minPerSubject, parseInt(req.query.maxPerSubject || "5", 10) || 5);

  const blueprint = buildMainPaperPlan({
    minPerSubject: 1,
    maxPerSubject: 5
  });

  res.json(blueprint);
});

// Provider resolver
async function runProvider(provider, payload) {
  if (provider === "openai") return await generateOpenAIQuestions(payload);
  if (provider === "local") return await generateLocalQuestions(payload);

  if (provider === "auto") {
    try {
      return await generateOpenAIQuestions(payload);
    } catch (e) {
      return await generateLocalQuestions(payload);
    }
  }

  throw new Error("provider must be openai|local|auto");
}

/**
 * Body supports:
 * - provider: openai|local|auto
 * - mode: "subject" | "main"
 *
 * subject mode:
 *   { subject, topic, count }
 *
 * main mode:
 *   {
 *     mode:"main",
 *     blueprint?: (optional) { perSubject: {...}, GE:10, EC:55 ... }
 *     geTopic?: string (optional)
 *   }
 *
 * Returns JSON that you can save directly.
 */
app.post("/api/ai/generate", authMiddleware, async (req, res) => {
  try {
    const provider = (req.body?.provider || DEFAULT_AI_PROVIDER).toLowerCase();
    const mode = (req.body?.mode || "subject").toLowerCase();

    // cache key
    const cacheKey = JSON.stringify({
      provider,
      mode,
      body: req.body,
      model: process.env.OPENAI_MODEL || process.env.LOCAL_LLM_MODEL || "",
    });

    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    // ---------- SUBJECT MODE ----------
    if (mode === "subject") {
      const { subject, topic, count = 5 } = req.body || {};
      if (!subject || !topic) return res.status(400).json({ error: "subject and topic are required" });

      const payload = {
        mode: "subject",
        subject,
        topic,
        count: Math.max(1, Math.min(parseInt(count, 10) || 5, 100)),
        typeMix: defaultTypeMix(Math.max(1, Math.min(parseInt(count, 10) || 5, 100))),
      };

      const data = await runProvider(provider, payload);
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

      // 1) Generate GE questions
      // (topic can be "Mixed" to keep it broad)
      const gePayload = {
        mode: "subject",
        subject: "General Aptitude",
        topic: req.body?.geTopic || "Mixed",
        count: geCount,
        typeMix: defaultTypeMix(geCount),
      };

      // 2) Generate EC per subject (including EC_MIXED)
      const subjectPayloads = [];
      for (const [sub, cnt] of Object.entries(perSubject)) {
        const n = parseInt(cnt, 10) || 0;
        if (n <= 0) continue;

        // EC_MIXED means: random EC topic bucket
        if (sub === "EC_MIXED") {
          subjectPayloads.push({
            mode: "subject",
            subject: "EC_MIXED",
            topic: "Mixed",
            count: n,
            typeMix: defaultTypeMix(n),
          });
        } else {
          subjectPayloads.push({
            mode: "subject",
            subject: sub,
            topic: "Mixed",
            count: n,
            typeMix: defaultTypeMix(n),
          });
        }
      }

      // run provider calls sequentially (safer for rate limits)
      const geOut = await runProvider(provider, gePayload);
      const ecOut = [];
      for (const p of subjectPayloads) {
        ecOut.push(await runProvider(provider, p));
      }

      // Merge questions into a single paper list
      const all = [];
      const pushQuestions = (resp, sectionName) => {
        const qs = resp?.questions || resp?.data?.questions || resp?.result?.questions;
        // If provider returns {questions:[...]} we use it. Otherwise accept resp.questions.
        if (Array.isArray(qs)) {
          for (const q of qs) all.push({ ...q, section: sectionName });
        } else if (Array.isArray(resp?.questions)) {
          for (const q of resp.questions) all.push({ ...q, section: sectionName });
        } else if (Array.isArray(resp)) {
          for (const q of resp) all.push({ ...q, section: sectionName });
        }
      };

      pushQuestions(geOut, "GE");
      for (const part of ecOut) {
        // section name from payload subject if present
        const sectionName =
          part?.subject || part?.meta?.subject || "EC";
        pushQuestions(part, sectionName);
      }

      // final response
      const result = {
        provider,
        mode: "main",
        blueprint,
        totalQuestions: all.length,
        questions: all,
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

app.post("/api/test/submit", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { score = null, accuracy = null, answers = {}, totalQuestions = null } = req.body || {};

    await pool.query(
      `INSERT INTO test_sessions (user_id, score, accuracy, answers, totalQuestions)
       VALUES ($1,$2,$3,$4,$5)`,
      [userId, score, accuracy, answers, totalQuestions]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error("Submit error:", e);
    res.status(500).json({ error: "Failed to submit test" });
  }
});

app.get("/api/test/history", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    const r = await pool.query(
      `SELECT id, user_id, score, accuracy, answers, totalQuestions, created_at
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

/* -------------------------
   Start
------------------------- */
const PORT = process.env.PORT || 4000;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Backend running on port ${PORT}`);
  console.log(`Password column = ${PASSWORD_COLUMN}`);
});
