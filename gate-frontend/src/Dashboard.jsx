import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api.js";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function Pie({ correct = 0, total = 0 }) {
  if (!total || total <= 0) {
    return <div style={{ padding: 12, textAlign: "center", opacity: 0.7 }}>N/A</div>;
  }

  const r = 46;
  const c = 2 * Math.PI * r;
  const pct = clamp(correct / total, 0, 1);
  const dash = c * pct;
  const gap = c - dash;

  return (
    <div style={{ display: "grid", placeItems: "center", gap: 10 }}>
      <svg width="140" height="140" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(0,0,0,0.10)" strokeWidth="14" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="rgba(0,0,0,0.75)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${gap}`}
          transform="rotate(-90 60 60)"
        />
        <text x="60" y="56" textAnchor="middle" fontSize="16" fontWeight="700">
          {Math.round(pct * 100)}%
        </text>
        <text x="60" y="74" textAnchor="middle" fontSize="10" opacity="0.7">
          Accuracy
        </text>
      </svg>

      <div style={{ display: "flex", gap: 14, fontSize: 13, opacity: 0.9 }}>
        <span>✅ {correct}/{total}</span>
        <span>❌ {total - correct}</span>
      </div>
    </div>
  );
}

const SUBJECTS = [
  "Networks",
  "Digital Electronics",
  "Control Systems",
  "Signals and Systems",
  "Analog Circuits",
  "Communication",
  "Electromagnetics",
  "Electronic Devices",
  "Engineering Mathematics",
];

function normalizeDifficulty(v) {
  const x = String(v || "").toLowerCase().trim();
  return x === "easy" || x === "medium" || x === "hard" ? x : "medium";
}

function ProgressOverlay({ progress, difficulty }) {
  const pct = Number(progress?.percent ?? 0);
  const step = progress?.step || "Preparing…";
  const status = progress?.status || "running";

  const generatedInserted = progress?.generatedInserted ?? 0;
  const generatedTarget = progress?.generatedTarget ?? 0;
  const doneBuckets = progress?.generatedBucketsDone ?? 0;
  const totalBuckets = progress?.generatedBucketsTotal ?? 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        style={{
          width: "min(760px, 94vw)",
          background: "white",
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(15, 23, 42, 0.22)",
          padding: 18,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 6 }}>Preparing Main Mock (65)…</div>
        <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }}>
          Difficulty: <b>{normalizeDifficulty(difficulty)}</b> • Please wait
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>{pct}%</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            {generatedInserted}/{generatedTarget} generated • {doneBuckets}/{totalBuckets} buckets
          </div>
        </div>

        <div
          style={{
            height: 10,
            borderRadius: 999,
            overflow: "hidden",
            background: "rgba(0,0,0,0.06)",
            border: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${clamp(pct, 0, 100)}%`,
              background: "rgba(17,24,39,0.75)",
              transition: "width 160ms linear",
            }}
          />
        </div>

        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>
          <b>Status:</b> {step}
        </div>
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.65 }}>
          {status === "running"
            ? "First run may take time if AI needs to generate new questions."
            : status === "done"
            ? "Done ✅"
            : status === "error"
            ? "Error ❌"
            : "Working…"}
        </div>
      </div>
    </div>
  );
}

function Pill({ children }) {
  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "rgba(0,0,0,0.03)",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}

export default function Dashboard({
  history = [],

  // Stage-9: start-main props (controlled by App)
  onStartMain = () => {},
  mainDifficulty = "medium",
  setMainDifficulty = () => {},
  startingMain = false,
  startProgress = null,

  onStartSubject = (_subject) => {},

  // AI Subject Generator (optional)
  aiGen = null,
  aiGenLoading = false,
  aiImportLoading = false,
  onAIGenerateSubject = null,
  onAIImportGenerated = null,

  // Stage-10
  onOpenReview = null,
  token = null,
}) {
  // mode selector: "main" or "subject"
  const [mode, setMode] = useState("main");
  const [subject, setSubject] = useState("Networks");

  // Stage-10: analytics data
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState(null);
  const [weakness, setWeakness] = useState(null);
  const [intel, setIntel] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  const filteredHistory = useMemo(() => {
    if (!Array.isArray(history) || history.length === 0) return [];
    return history.filter((h) => {
      const hMode = h?.mode || "main";
      if (hMode !== mode) return false;
      if (mode === "subject") return (h?.subject || "") === subject;
      return true;
    });
  }, [history, mode, subject]);

  const latest = filteredHistory[0] || null;

  const latestTotal =
    latest?.totalquestions ?? latest?.totalQuestions ?? latest?.total ?? latest?.total_questions ?? null;

  const latestAcc = latest?.accuracy != null ? Number(latest.accuracy) : null;

  const latestCorrect =
    latestAcc != null && latestTotal ? Math.round((latestAcc / 100) * Number(latestTotal)) : 0;

  const avg = useMemo(() => {
    if (!filteredHistory.length) return null;
    const n = filteredHistory.length;
    let sumScore = 0;
    let sumAcc = 0;
    for (const h of filteredHistory) {
      sumScore += Number(h?.score ?? 0);
      sumAcc += Number(h?.accuracy ?? 0);
    }
    return { attempts: n, avgScore: sumScore / n, avgAccuracy: sumAcc / n };
  }, [filteredHistory]);

  const hasData = filteredHistory.length > 0;

  // Stage-10: load analytics (overview + weakness + intel)
  useEffect(() => {
    if (!token) return;

    (async () => {
      setLoadingAnalytics(true);
      try {
        const d = clamp(parseInt(days, 10) || 30, 1, 365);

        const [o, w, i] = await Promise.all([
          apiFetch(`/analytics/overview?days=${d}`, { token }),
          apiFetch(`/analytics/weakness?days=${d}`, { token }),
          apiFetch(`/intel/recommendations?days=${d}`, { token }),
        ]);

        setOverview(o);
        setWeakness(w);
        setIntel(i);
      } catch (e) {
        setOverview(null);
        setWeakness(null);
        setIntel(null);
      } finally {
        setLoadingAnalytics(false);
      }
    })();
  }, [token, days]);

  async function handleAIGenerate() {
    if (!onAIGenerateSubject) {
      alert("AI generate handler missing (frontend wiring bug)");
      return;
    }
    try {
      await onAIGenerateSubject({
        subject: "Engineering Mathematics",
        topic: "Mixed",
        count: 5,
        difficulty: "medium",
      });
    } catch (e) {
      alert(e?.message || "AI generate failed");
    }
  }

  async function handleAIImport() {
    if (!onAIImportGenerated) {
      alert("AI import handler missing (frontend wiring bug)");
      return;
    }
    try {
      await onAIImportGenerated();
    } catch (e) {
      alert(e?.message || "Import failed");
    }
  }

  const aiPreview = useMemo(() => {
    const qs = aiGen?.questions;
    if (!Array.isArray(qs) || qs.length === 0) return null;
    return qs.slice(0, 3).map((q, i) => ({
      i,
      type: q?.type,
      difficulty: q?.difficulty,
      subject: q?.subject,
      topic: q?.topic,
      question: q?.question,
    }));
  }, [aiGen]);

  return (
    <div className="dashWrap">
      {startingMain ? <ProgressOverlay progress={startProgress} difficulty={mainDifficulty} /> : null}

      {/* TOP TILE */}
      <section className="tile">
        <div className="tileHeader">
          <h2>Overview</h2>

          <div className="modeRow">
            <button className={`segBtn ${mode === "main" ? "active" : ""}`} onClick={() => setMode("main")} type="button">
              Main
            </button>
            <button
              className={`segBtn ${mode === "subject" ? "active" : ""}`}
              onClick={() => setMode("subject")}
              type="button"
            >
              Subject-wise
            </button>

            {mode === "subject" && (
              <select className="sel" value={subject} onChange={(e) => setSubject(e.target.value)}>
                {SUBJECTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="topGrid">
          <div className="card">
            <div className="cardTitle">Latest test</div>
            {hasData ? <Pie correct={latestCorrect} total={Number(latestTotal || 0)} /> : <div className="naBox">N/A</div>}

            {hasData && (
              <div className="mini">
                <div>
                  Score: <b>{latest?.score ?? "N/A"}</b>
                </div>
                <div>
                  Accuracy: <b>{latest?.accuracy ?? "N/A"}</b>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="cardTitle">Average (all tests)</div>
            {avg ? (
              <div className="avgGrid">
                <div className="avgItem">
                  <div className="avgLabel">Attempts</div>
                  <div className="avgValue">{avg.attempts}</div>
                </div>
                <div className="avgItem">
                  <div className="avgLabel">Avg score</div>
                  <div className="avgValue">{avg.avgScore.toFixed(2)}</div>
                </div>
                <div className="avgItem">
                  <div className="avgLabel">Avg accuracy</div>
                  <div className="avgValue">{avg.avgAccuracy.toFixed(2)}%</div>
                </div>
              </div>
            ) : (
              <div className="naBox">N/A</div>
            )}
          </div>
        </div>
      </section>

      <hr className="sep" />

      {/* START TEST */}
      <section className="tile">
        <h2>Start a test</h2>

        <div className="startRow" style={{ alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {mode === "main" ? (
            <>
              <button className="primaryBtn" onClick={onStartMain} type="button" disabled={startingMain}>
                {startingMain ? "Starting…" : "Start Main Mock (65)"}
              </button>

              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Difficulty</span>
                <select
                  className="sel"
                  value={mainDifficulty}
                  onChange={(e) => setMainDifficulty(e.target.value)}
                  disabled={startingMain}
                >
                  <option value="easy">easy</option>
                  <option value="medium">medium</option>
                  <option value="hard">hard</option>
                </select>
              </label>
            </>
          ) : (
            <button className="primaryBtn" onClick={() => onStartSubject(subject)} type="button">
              Start {subject} Mock (65)
            </button>
          )}

          <div className="hint">Always 65 questions (Main: 10 GA + 55 EC).</div>
        </div>
      </section>

      {/* AI SUBJECT GENERATOR (Optional) */}
      <hr className="sep" />
      <section className="tile">
        <h2>AI Subject Generator (Optional)</h2>

        <div className="hint" style={{ marginBottom: 10 }}>
          Keep this if you want to quickly grow your DB question bank. If you want pure “GATE portal UI”, you can delete this section.
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button className="primaryBtn" type="button" onClick={handleAIGenerate} disabled={aiGenLoading}>
            {aiGenLoading ? "Generating…" : "Generate AI Questions"}
          </button>

          <button
            className="segBtn"
            type="button"
            onClick={handleAIImport}
            disabled={aiImportLoading || !(Array.isArray(aiGen?.questions) && aiGen.questions.length)}
          >
            {aiImportLoading ? "Importing…" : "Import to DB"}
          </button>
        </div>

        <div className="card" style={{ marginTop: 10 }}>
          <div className="cardTitle">Latest AI response</div>

          {aiGen && Array.isArray(aiGen?.questions) ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 13, opacity: 0.9 }}>
                Returned: <b>{aiGen.questions.length}</b> questions
              </div>

              {aiPreview ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {aiPreview.map((p) => (
                    <div
                      key={p.i}
                      style={{
                        padding: 10,
                        border: "1px solid rgba(0,0,0,0.08)",
                        borderRadius: 12,
                      }}
                    >
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        #{p.i + 1} • <b>{p.type}</b> • difficulty=<b>{p.difficulty ?? "—"}</b> • {p.subject} • {p.topic}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 13 }}>{p.question}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="naBox">No preview</div>
              )}
            </div>
          ) : (
            <div className="naBox">N/A</div>
          )}
        </div>
      </section>

      {/* STAGE-10 ANALYTICS */}
      <hr className="sep" />
      <section className="tile">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2>Analytics (Stage-10)</h2>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, opacity: 0.75 }}>Window days</span>
            <input
              className="sel"
              style={{ width: 120 }}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              inputMode="numeric"
            />
          </label>
        </div>

        {loadingAnalytics ? (
          <div className="naBox">Loading analytics…</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div className="card">
              <div className="cardTitle">Overview</div>
              {overview ? (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Pill>attempts: {overview.attempts ?? "—"}</Pill>
                  <Pill>avgScore: {overview.avgScore ?? "—"}</Pill>
                  <Pill>bestScore: {overview.bestScore ?? "—"}</Pill>
                  <Pill>avgAccuracy: {overview.avgAccuracy ?? "—"}</Pill>
                </div>
              ) : (
                <div className="naBox">N/A</div>
              )}
            </div>

            <div className="card">
              <div className="cardTitle">Weakness</div>
              {weakness ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    minAttempts threshold: <b>{weakness.minAttempts}</b>
                  </div>

                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontWeight: 800 }}>Weak Subjects</div>
                    {Array.isArray(weakness.weakSubjects) && weakness.weakSubjects.length ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {weakness.weakSubjects.slice(0, 12).map((x, i) => (
                          <Pill key={i}>
                            {x.subject}: score {x.score} • acc {x.accuracy}
                          </Pill>
                        ))}
                      </div>
                    ) : (
                      <div className="naBox">No weak subjects yet</div>
                    )}
                  </div>

                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontWeight: 800 }}>Weak Topics</div>
                    {Array.isArray(weakness.weakTopics) && weakness.weakTopics.length ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {weakness.weakTopics.slice(0, 12).map((x, i) => (
                          <Pill key={i}>
                            {x.subject}/{x.topic}: score {x.score} • acc {x.accuracy}
                          </Pill>
                        ))}
                      </div>
                    ) : (
                      <div className="naBox">No weak topics yet</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="naBox">N/A</div>
              )}
            </div>

            <div className="card">
              <div className="cardTitle">Intel Recommendations</div>
              {intel?.recommendations ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Focus Subjects</div>
                    {Array.isArray(intel.recommendations.focusSubjects) && intel.recommendations.focusSubjects.length ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {intel.recommendations.focusSubjects.map((s, i) => (
                          <Pill key={i}>{s}</Pill>
                        ))}
                      </div>
                    ) : (
                      <div className="naBox">No focus subjects yet</div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Focus Topics</div>
                    {Array.isArray(intel.recommendations.focusTopics) && intel.recommendations.focusTopics.length ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {intel.recommendations.focusTopics.map((t, i) => (
                          <Pill key={i}>{t.subject}/{t.topic}</Pill>
                        ))}
                      </div>
                    ) : (
                      <div className="naBox">No focus topics yet</div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Actions</div>
                    {Array.isArray(intel.recommendations.actions) && intel.recommendations.actions.length ? (
                      <div style={{ display: "grid", gap: 6 }}>
                        {intel.recommendations.actions.map((a, i) => (
                          <div key={i} style={{ fontSize: 13 }}>
                            • {a}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="naBox">No actions yet</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="naBox">N/A</div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* HISTORY + REVIEW */}
      <hr className="sep" />
      <section className="tile">
        <h2>History</h2>

        {filteredHistory.length ? (
          <div className="histList">
            {filteredHistory.map((h, idx) => (
              <div className="histItem" key={h?.id ?? idx} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div className="histLeft">
                  <div className="histTop">
                    <b>Score:</b> {h?.score ?? "—"} <span className="dot">•</span> <b>Accuracy:</b> {h?.accuracy ?? "—"}
                  </div>
                  <div className="histBottom">
                    Total: {h?.totalQuestions ?? h?.totalquestions ?? "—"} <span className="dot">•</span>{" "}
                    Time: {h?.created_at ? new Date(h.created_at).toISOString() : "—"}
                  </div>
                </div>

                {onOpenReview && h?.id ? (
                  <button className="segBtn" type="button" onClick={() => onOpenReview(h.id)}>
                    Review
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="naBox">N/A</div>
        )}
      </section>
    </div>
  );
}
