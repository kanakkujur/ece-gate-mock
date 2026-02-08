// FILE: gate-backend/src/dbEnsure.js
// Purpose: safe, idempotent schema additions for Stage-7 (and missing Stage-6 helpers)

export async function ensureStage7Schema(pool) {
  // 1) Ensure question_usage exists (Stage-6 needs this)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.question_usage (
      user_id       INT NOT NULL,
      question_id   INT NOT NULL,
      test_id       INT NOT NULL,
      used_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, question_id, test_id)
    );
  `);

  // Helpful indexes
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_question_usage_user ON public.question_usage(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_question_usage_q ON public.question_usage(question_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_question_usage_test ON public.question_usage(test_id);`);

  // 2) Ensure questions table has question_hash column + unique index (Stage-6C)
  // (If you already have it, these are no-ops)
  await pool.query(`ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS question_hash TEXT;`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS questions_question_hash_uniq ON public.questions(question_hash) WHERE question_hash IS NOT NULL;`
  );

  // 3) Stage-7: add columns to test_sessions for review/eval
  await pool.query(`ALTER TABLE public.test_sessions ADD COLUMN IF NOT EXISTS question_ids INT[];`);
  await pool.query(`ALTER TABLE public.test_sessions ADD COLUMN IF NOT EXISTS questions JSONB;`);
  await pool.query(`ALTER TABLE public.test_sessions ADD COLUMN IF NOT EXISTS eval JSONB;`);
  await pool.query(`ALTER TABLE public.test_sessions ADD COLUMN IF NOT EXISTS max_score REAL;`);

  // 4) Stage-7C: per-question attempts table (analytics + review drilldown)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.question_attempts (
      test_id        INT NOT NULL,
      user_id        INT NOT NULL,
      question_id    INT,
      subject        TEXT,
      topic          TEXT,
      type           TEXT,
      is_correct     BOOLEAN NOT NULL DEFAULT false,
      is_skipped     BOOLEAN NOT NULL DEFAULT false,
      marks_awarded  REAL NOT NULL DEFAULT 0,
      neg_awarded    REAL NOT NULL DEFAULT 0,
      answer_given   TEXT,
      correct_answer TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (test_id, user_id, question_id)
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_qattempts_user_time ON public.question_attempts(user_id, created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_qattempts_user_subject ON public.question_attempts(user_id, subject);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_qattempts_user_topic ON public.question_attempts(user_id, topic);`);
}
