// FILE: gate-backend/src/scoring.js
// Stage-7B: Score computation

export function maxScoreFromQuestions(questions) {
  const qs = Array.isArray(questions) ? questions : [];
  return qs.reduce((sum, q) => sum + (Number(q.marks) || 1), 0);
}

export function computeScoreSummary({ questions, attempt }) {
  const qs = Array.isArray(questions) ? questions : [];
  const items = Array.isArray(attempt?.items) ? attempt.items : [];

  let score = 0;
  let negTotal = 0;
  let marksTotal = 0;

  const bySubject = new Map(); // subject -> metrics
  const byType = new Map(); // MCQ/MSQ/NAT -> metrics

  for (const it of items) {
    marksTotal += Number(it.marksAwarded) || 0;
    negTotal += Number(it.negAwarded) || 0;
    score += (Number(it.marksAwarded) || 0) - (Number(it.negAwarded) || 0);

    const sub = String(it.subject ?? "Unknown");
    const t = String(it.type ?? "UNK");

    if (!bySubject.has(sub)) bySubject.set(sub, { subject: sub, total: 0, correct: 0, wrong: 0, skipped: 0, marks: 0, neg: 0, score: 0 });
    if (!byType.has(t)) byType.set(t, { type: t, total: 0, correct: 0, wrong: 0, skipped: 0, marks: 0, neg: 0, score: 0 });

    const s = bySubject.get(sub);
    const ty = byType.get(t);

    for (const obj of [s, ty]) {
      obj.total += 1;
      if (it.isSkipped) obj.skipped += 1;
      else if (it.isCorrect) obj.correct += 1;
      else obj.wrong += 1;

      obj.marks += Number(it.marksAwarded) || 0;
      obj.neg += Number(it.negAwarded) || 0;
      obj.score += (Number(it.marksAwarded) || 0) - (Number(it.negAwarded) || 0);
    }
  }

  const maxScore = maxScoreFromQuestions(qs);
  const attempted = attempt?.totals?.attempted ?? items.filter((x) => !x.isSkipped).length;
  const correct = attempt?.totals?.correct ?? items.filter((x) => x.isCorrect).length;
  const accuracy = attempted > 0 ? Math.round((correct / attempted) * 10000) / 100 : 0;

  const breakdown = {
    totals: {
      questions: qs.length,
      attempted,
      correct,
      wrong: attempt?.totals?.wrong ?? items.filter((x) => x.isWrong).length,
      skipped: attempt?.totals?.skipped ?? items.filter((x) => x.isSkipped).length,
      marksTotal,
      negTotal,
      score,
      maxScore,
      accuracy,
    },
    bySubject: Array.from(bySubject.values()).sort((a, b) => (b.score - a.score) || a.subject.localeCompare(b.subject)),
    byType: Array.from(byType.values()).sort((a, b) => a.type.localeCompare(b.type)),
  };

  return { score, accuracy, maxScore, breakdown };
}
