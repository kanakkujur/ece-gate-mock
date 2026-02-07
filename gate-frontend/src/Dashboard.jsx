// FILE: ~/gate-frontend/src/Dashboard.jsx
import React, { useMemo, useState } from "react";

/**
 * Stage-6B (Option A):
 * - AI Subject Generator difficulty dropdown (easy/medium/hard)
 *
 * Stage-6C (Main start):
 * - Difficulty dropdown beside "Start Main Mock (65)"
 * - When clicked, show buffering overlay while backend generates/picks questions
 * - Calls onStartMain({ difficulty })
 */

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

function BufferingOverlay({ title = "Generating questions…", subtitle = "Please wait" }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.35)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        style={{
          width: "min(520px, 92vw)",
          background: "white",
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 16,
          boxShadow: "0 20px 50px rgba(15, 23, 42, 0.18)",
          padding: 18,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 14 }}>{subtitle}</div>

        {/* “YouTube buffering” vibe: shimmer bar */}
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
              width: "40%",
              borderRadius: 999,
              background:
                "linear-gradient(90deg, rgba(17,24,39,0.08), rgba(17,24,39,0.30), rgba(17,24,39,0.08))",
              animation: "shimmer 1.1s linear infinite",
            }}
          />
        </div>

        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.65 }}>
          This can take some time when AI has to generate new questions.
        </div>

        <style>{`
          @keyframes shimmer {
            0% { transform: translateX(-60%); }
            100% { transform: translateX(260%); }
          }
        `}</style>
      </div>
    </div>
  );
}

export default function Dashboard({
  history = [],

  // Stage-6C: expect onStartMain({ difficulty })
  // (If you still pass a no-arg function, this code still works, but difficulty won't be used)
  onStartMain = () => {},
  onStartSubject = (_subject) => {},

  // Stage-6B props:
  aiGen = null,
  aiGenLoading = false,
  aiImportLoading = false,
  onAIGenerateSubject = null,
  onAIImportGenerated = null,
}) {
  // type selector: "main" or "subject"
  const [mode, setMode] = useState("main");
  const [subject, setSubject] = useState("Networks"); // used in subject mode

  // Stage-6C (Main start difficulty + buffering overlay)
  const [mainDifficulty, setMainDifficulty] = useState("medium"); // easy|medium|hard
  const [startingMain, setStartingMain] = useState(false);

  // Stage-6B (AI subject generation inputs)
  const [aiSubject, setAiSubject] = useState("Networks");
  const [aiTopic, setAiTopic] = useState("Basics");
  const [aiCount, setAiCount] = useState(5);
  const [aiDifficulty, setAiDifficulty] = useState("medium"); // easy|medium|hard

  const filteredHistory = useMemo(() => {
    if (!Array.isArray(history) || history.length === 0) return [];

    return history.filter((h) => {
      const hMode = h?.mode || "main";
      if (hMode !== mode) return false;
      if (mode === "subject") {
        return (h?.subject || "") === subject;
      }
      return true;
    });
  }, [history, mode, subject]);

  const latest = filteredHistory[0] || null;

  const latestTotal =
    latest?.totalquestions ??
    latest?.totalQuestions ??
    latest?.total ??
    latest?.total_questions ??
    null;

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
    return {
      attempts: n,
      avgScore: sumScore / n,
      avgAccuracy: sumAcc / n,
    };
  }, [filteredHistory]);

  const hasData = filteredHistory.length > 0;

  async function handleStartMain() {
    try {
      setStartingMain(true);
      const diff = normalizeDifficulty(mainDifficulty);

      // Supports both signatures:
      // - onStartMain() old
      // - onStartMain({difficulty}) new for Stage-6C
      const maybePromise =
        onStartMain.length >= 1 ? onStartMain({ difficulty: diff }) : onStartMain();

      // If it returns a promise, await it
      if (maybePromise && typeof maybePromise.then === "function") {
        await maybePromise;
      }
    } catch (e) {
      alert(e?.message || "Failed to start main test");
    } finally {
      setStartingMain(false);
    }
  }

  async function handleAIGenerate() {
    if (!onAIGenerateSubject) {
      alert("AI generate handler missing (frontend wiring bug)");
      return;
    }
    try {
      const c = clamp(parseInt(aiCount, 10) || 5, 1, 50);
      const diff = String(aiDifficulty || "medium").toLowerCase();
      await onAIGenerateSubject({
        subject: aiSubject,
        topic: aiTopic || "Mixed",
        count: c,
        difficulty: diff, // ✅ Stage-6B requirement
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
      {startingMain ? (
        <BufferingOverlay
          title="Generating questions for Main Mock (65)…"
          subtitle={`Difficulty: ${normalizeDifficulty(mainDifficulty)} • Please wait while we prepare your test`}
        />
      ) : null}

      {/* TOP TILE */}
      <section className="tile">
        <div className="tileHeader">
          <h2>Overview</h2>

          <div className="modeRow">
            <button
              className={`segBtn ${mode === "main" ? "active" : ""}`}
              onClick={() => setMode("main")}
              type="button"
            >
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
          {/* t1 */}
          <div className="card">
            <div className="cardTitle">Latest test</div>
            {hasData ? (
              <Pie correct={latestCorrect} total={Number(latestTotal || 0)} />
            ) : (
              <div className="naBox">N/A</div>
            )}

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

          {/* t2 */}
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

      {/* MID TILE */}
      <section className="tile">
        <h2>Start a test</h2>

        <div className="startRow" style={{ alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {mode === "main" ? (
            <>
              <button
                className="primaryBtn"
                onClick={handleStartMain}
                type="button"
                disabled={startingMain}
                title="Starts a Main mock using difficulty + AI/DB logic (Stage-6C)"
              >
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

          <div className="hint">
            No “number of questions” selector — always 65 (Main: 10 GA + 55 EC).
          </div>
        </div>
      </section>

      {/* STAGE-6B: AI SUBJECT GENERATION (Option A) */}
      <hr className="sep" />
      <section className="tile">
        <h2>AI Subject Generator (Stage-6B)</h2>

        <div className="hint" style={{ marginBottom: 10 }}>
          Generates questions via <b>/api/ai/generate</b> in <b>subject</b> mode only. Existing flows unchanged.
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>Subject</span>
              <select className="sel" value={aiSubject} onChange={(e) => setAiSubject(e.target.value)}>
                {SUBJECTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>Topic</span>
              <input
                className="sel"
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                placeholder="Basics / Mixed / etc"
              />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>Count</span>
              <input
                className="sel"
                style={{ width: 120 }}
                value={aiCount}
                onChange={(e) => setAiCount(e.target.value)}
                inputMode="numeric"
              />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>Difficulty</span>
              <select className="sel" value={aiDifficulty} onChange={(e) => setAiDifficulty(e.target.value)}>
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
              </select>
            </label>

            <button className="primaryBtn" type="button" onClick={handleAIGenerate} disabled={aiGenLoading}>
              {aiGenLoading ? "Generating…" : "Generate AI Questions"}
            </button>

            <button
              className="segBtn"
              type="button"
              onClick={handleAIImport}
              disabled={aiImportLoading || !(Array.isArray(aiGen?.questions) && aiGen.questions.length)}
              title="Imports latest generated questions into DB"
            >
              {aiImportLoading ? "Importing…" : "Import to DB"}
            </button>
          </div>

          {/* Confirmation / preview */}
          <div className="card" style={{ marginTop: 6 }}>
            <div className="cardTitle">Latest AI response</div>

            {aiGen && Array.isArray(aiGen?.questions) ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 13, opacity: 0.9 }}>
                  Returned: <b>{aiGen.questions.length}</b> questions • Subject:{" "}
                  <b>{aiGen.subject || aiSubject}</b> • Topic: <b>{aiGen.topic || aiTopic}</b>
                </div>

                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  Expected difficulty: <b>{aiDifficulty}</b>
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
                          #{p.i + 1} • <b>{p.type}</b> • difficulty=<b>{p.difficulty ?? "—"}</b> •{" "}
                          {p.subject} • {p.topic}
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
        </div>
      </section>

      <hr className="sep" />

      {/* BOTTOM TILE */}
      <section className="tile">
        <h2>History</h2>

        {filteredHistory.length ? (
          <div className="histList">
            {filteredHistory.map((h, idx) => (
              <div className="histItem" key={h?.id ?? idx}>
                <div className="histLeft">
                  <div className="histTop">
                    <b>Score:</b> {h?.score ?? "—"} <span className="dot">•</span>{" "}
                    <b>Accuracy:</b> {h?.accuracy ?? "—"}
                  </div>
                  <div className="histBottom">
                    Total: {h?.totalQuestions ?? h?.totalquestions ?? "—"} <span className="dot">•</span>{" "}
                    Time: {h?.created_at ? new Date(h.created_at).toISOString() : "—"}
                  </div>
                </div>
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
