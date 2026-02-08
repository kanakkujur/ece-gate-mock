// FILE: gate-backend/src/analytics.js
// Stage-7E: Analytics queries (DB driven)

function clamp(n, lo, hi) {
  n = Number(n);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

export async function buildAnalyticsOverview(pool, { userId, days = 30 }) {
  days = clamp(days, 1, 365);

  const meta = await pool.query(
    `
    SELECT
      COUNT(*)::int AS attempts,
      COALESCE(AVG(score),0)::float AS avg_score,
      COALESCE(MAX(score),0)::float AS best_score,
      COALESCE(AVG(accuracy),0)::float AS avg_accuracy
    FROM public.test_sessions
    WHERE user_id=$1
      AND is_submitted=true
      AND created_at >= now() - ($2 || ' days')::interval
    `,
    [userId, days]
  );

  const subj = await pool.query(
    `
    SELECT
      COALESCE(subject,'Unknown') AS subject,
      COUNT(*)::int AS total,
      SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::int AS correct,
      SUM(CASE WHEN is_skipped THEN 1 ELSE 0 END)::int AS skipped,
      SUM(marks_awarded)::float AS marks,
      SUM(neg_awarded)::float AS neg,
      SUM(marks_awarded - neg_awarded)::float AS score
    FROM public.question_attempts
    WHERE user_id=$1
      AND created_at >= now() - ($2 || ' days')::interval
    GROUP BY COALESCE(subject,'Unknown')
    ORDER BY score ASC, total DESC
    `,
    [userId, days]
  );

  const bySubject = subj.rows.map((r) => {
    const attempted = r.total - r.skipped;
    const acc = attempted > 0 ? Math.round((r.correct / attempted) * 10000) / 100 : 0;
    return { ...r, attempted, accuracy: acc };
  });

  return {
    windowDays: days,
    attempts: meta.rows[0]?.attempts ?? 0,
    avgScore: meta.rows[0]?.avg_score ?? 0,
    bestScore: meta.rows[0]?.best_score ?? 0,
    avgAccuracy: meta.rows[0]?.avg_accuracy ?? 0,
    bySubject,
  };
}

export async function buildWeaknessReport(pool, { userId, days = 30, minAttempts = 10 }) {
  days = clamp(days, 1, 365);
  minAttempts = clamp(minAttempts, 1, 500);

  const topics = await pool.query(
    `
    SELECT
      COALESCE(subject,'Unknown') AS subject,
      COALESCE(topic,'Mixed') AS topic,
      COUNT(*)::int AS total,
      SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::int AS correct,
      SUM(CASE WHEN is_skipped THEN 1 ELSE 0 END)::int AS skipped,
      SUM(marks_awarded - neg_awarded)::float AS score
    FROM public.question_attempts
    WHERE user_id=$1
      AND created_at >= now() - ($2 || ' days')::interval
    GROUP BY COALESCE(subject,'Unknown'), COALESCE(topic,'Mixed')
    HAVING COUNT(*) >= $3
    ORDER BY (SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::float / NULLIF((COUNT(*) - SUM(CASE WHEN is_skipped THEN 1 ELSE 0 END)),0)) ASC NULLS LAST,
             COUNT(*) DESC
    `,
    [userId, days, minAttempts]
  );

  const weakTopics = topics.rows.map((r) => {
    const attempted = r.total - r.skipped;
    const acc = attempted > 0 ? Math.round((r.correct / attempted) * 10000) / 100 : 0;
    return { ...r, attempted, accuracy: acc };
  });

  // Subject-level aggregation (more stable)
  const subj = await pool.query(
    `
    SELECT
      COALESCE(subject,'Unknown') AS subject,
      COUNT(*)::int AS total,
      SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::int AS correct,
      SUM(CASE WHEN is_skipped THEN 1 ELSE 0 END)::int AS skipped,
      SUM(marks_awarded - neg_awarded)::float AS score
    FROM public.question_attempts
    WHERE user_id=$1
      AND created_at >= now() - ($2 || ' days')::interval
    GROUP BY COALESCE(subject,'Unknown')
    HAVING COUNT(*) >= $3
    ORDER BY (SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::float / NULLIF((COUNT(*) - SUM(CASE WHEN is_skipped THEN 1 ELSE 0 END)),0)) ASC NULLS LAST,
             COUNT(*) DESC
    `,
    [userId, days, minAttempts]
  );

  const weakSubjects = subj.rows.map((r) => {
    const attempted = r.total - r.skipped;
    const acc = attempted > 0 ? Math.round((r.correct / attempted) * 10000) / 100 : 0;
    return { ...r, attempted, accuracy: acc };
  });

  return {
    windowDays: days,
    minAttempts,
    weakSubjects,
    weakTopics,
  };
}

export function recommendationsFromWeaknessReport(report) {
  const weakSubjects = Array.isArray(report?.weakSubjects) ? report.weakSubjects : [];
  const weakTopics = Array.isArray(report?.weakTopics) ? report.weakTopics : [];

  const topSubjects = [...weakSubjects]
    .filter((x) => Number.isFinite(Number(x.accuracy)))
    .sort((a, b) => (a.accuracy - b.accuracy) || (b.total - a.total))
    .slice(0, 3);

  const topTopics = [...weakTopics]
    .filter((x) => Number.isFinite(Number(x.accuracy)))
    .sort((a, b) => (a.accuracy - b.accuracy) || (b.total - a.total))
    .slice(0, 6);

  const actions = [];

  for (const s of topSubjects) {
    actions.push({
      type: "subject-focus",
      subject: s.subject,
      message: `Low accuracy in ${s.subject} (${s.accuracy}%) over ${s.attempted} attempts. Do a focused revision + 30 mixed questions.`,
    });
  }

  for (const t of topTopics) {
    actions.push({
      type: "topic-drill",
      subject: t.subject,
      topic: t.topic,
      message: `Topic drill: ${t.subject} → ${t.topic} (${t.accuracy}%). Do 15 questions + note common mistakes.`,
    });
  }

  actions.push({
    type: "strategy",
    message: "For MCQ negatives: attempt only when you can eliminate at least 2 options; else mark for review.",
  });

  return {
    focusSubjects: topSubjects,
    focusTopics: topTopics,
    actions,
  };
}
