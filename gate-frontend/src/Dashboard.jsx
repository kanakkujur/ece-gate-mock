// FILE: ~/gate-frontend/src/Dashboard.jsx
import React, { useMemo, useState } from "react";

/**
 * Stage-8 polish (hardened):
 * - AI Subject Generator OPTIONAL (collapsed by default)
 * - Main start difficulty remains
 * - Defensive rendering: NEVER render objects directly (prevents white-screen crash)
 */

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function toNumberOrNull(v) {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  }
  return null;
}

function safeText(v, fallback = "—") {
  if (v == null) return fallback;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map((x) => safeText(x, "")).filter(Boolean).join(", ") || fallback;
  if (isPlainObject(v)) {
    // Avoid React crash: stringify objects
    try {
      return JSON.stringify(v);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function formatScore(v) {
  const n = toNumberOrNull(v);
  if (n == null) return "—";
  // keep negative allowed
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function formatPct(v) {
  const n = toNumberOrNull(v);
  if (n == null) return "—";
  return `${n.toFixed(2)}%`;
}

function formatDateISO(v) {
  if (!v) return "—";
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return safeText(v, "—");
    return d.toISOString();
  } catch {
    return safeText(v, "—");
  }
}

function Pie({ correct = 0, total = 0 }) {
  const t = toNumberOrNull(total) ?? 0;
  const c0 = toNumberOrNull(correct) ?? 0;

  if (!t || t <= 0) {
    return <div style={{ padding: 12, textAlign: "center", opacity: 0.7 }}>N/A</div>;
  }

  const r = 46;
  const circ = 2 * Math.PI * r;
  const pct = clamp(c0 / t, 0, 1);
  const dash = circ * pct;
  const gap = circ - dash;

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
        <span>✅ {Math.max(0, Math.round(c0))}/{Math.max(0, Math.round(t))}</span>
        <span>❌ {Math.max(0, Math.round(t - c0))}</span>
      </div>
    </div>
  );
}

const SUBJECTS = [
  "Networks",
  "Digital Circuits",
  "Control Systems",
  "Signals & Systems",
  "Analog Circuits",
  "Communication Systems",
  "Electromagnetics",
  "Electronic Devices",
  "Engineering Mathematics",
  "Computer Organization",
];

function normalizeDifficulty(v) {
  const x = String(v || "").toLowerCase().trim();
  return x === "easy" || x === "medium" || x === "hard" ? x : "medium";
}

export default function Dashboard({
  history = [],

  onStartMain = () => {},
  onStartSubject = (_subject) => {},

  // Stage-6B props:
  aiGen = null,
  aiGenLoading = false,
  aiImportLoading = false,
  onAIGenerateSubject = null,
  onAIImportGenerated = null,

  // Stage-8: optionally show AI generator block
  showAIGeneratorDefault = false,
}) {
  const [mode, setMode] = useState("main");
  const [subject, setSubject] = useState("Networks");

  // Main start difficulty
  const [mainDifficulty, setMainDifficulty] = useState("medium");
  const [startingMain, setStartingMain] = useState(false);

  // AI generator collapsed by default
  const [showAIGen, setShowAIGen] = useState(!!showAIGeneratorDefault);

  // AI subject generation inputs
  const [aiSubject, setAiSubject] = useState("Networks");
  const [aiTopic, setAiTopic] = useState("Basics");
  const [aiCount, setAiCount] = useState(5);
  const [aiDifficulty, setAiDifficulty] = useState("medium");

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

  // total questions can come under many names
  const latestTotal =
    latest?.totalquestions ??
    latest?.totalQuestions ??
    latest?.total ??
    latest?.total_questions ??
    null;

  const latestAcc = toNumberOrNull(latest?.accuracy);

  // correct estimate from accuracy + total
  const latestCorrect =
    latestAcc != null && toNumberOrNull(latestTotal) != null
      ? Math.round((latestAcc / 100) * Number(latestTotal))
      : 0;

  const avg = useMemo(() => {
    if (!filteredHistory.length) return null;
    const n = filteredHistory.length;

    let sumScore = 0;
    let sumAcc = 0;
    let cntScore = 0;
    let cntAcc = 0;

    for (const h of filteredHistory) {
      const s = toNumberOrNull(h?.score);
      const a = toNumberOrNull(h?.accuracy);
      if (s != null) {
        sumScore += s;
        cntScore += 1;
      }
      if (a != null) {
        sumAcc += a;
        cntAcc += 1;
      }
    }

    return {
      attempts: n,
      avgScore: cntScore ? sumScore / cntScore : 0,
      avgAccuracy: cntAcc ? sumAcc / cntAcc : 0,
    };
  }, [filteredHistory]);

  const hasData = filteredHistory.length > 0;

  async function handleStartMain() {
    try {
      setStartingMain(true);
      const diff = normalizeDifficulty(mainDifficulty);

      const maybePromise =
        onStartMain.length >= 1 ? onStartMain({ difficulty: diff }) : onStartMain();

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
      const diff = normalizeDifficulty(aiDifficulty);
      await onAIGenerateSubject({
        subject: aiSubject,
        topic: aiTopic || "Mixed",
        count: c,
        difficulty: diff,
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
      {/* OVERVIEW */}
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
          <div className="card">
            <div className="cardTitle">Latest test</div>

            {hasData ? (
              <Pie correct={latestCorrect} total={toNumberOrNull(latestTotal) ?? 0} />
            ) : (
              <div className="naBox">N/A</div>
            )}

            {hasData && (
              <div className="mini">
                <div>
                  Score: <b>{formatScore(latest?.score)}</b>
                </div>
                <div>
                  Accuracy: <b>{formatPct(latest?.accuracy)}</b>
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
                  <div className="avgValue">{formatScore(avg.avgScore)}</div>
                </div>
                <div className="avgItem">
                  <div className="avgLabel">Avg accuracy</div>
                  <div className="avgValue">{formatPct(avg.avgAccuracy)}</div>
                </div>
              </div>
            ) : (
              <div className="naBox">N/A</div>
            )}
          </div>
        </div>
      </section>

      <hr className="sep" />

      {/* START */}
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

          <div className="hint">Always 65 questions (Main: 10 GE + 55 EC).</div>
        </div>
      </section>

      <hr className="sep" />

      {/* AI (OPTIONAL) */}
      <section className="tile">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <h2 style={{ margin: 0 }}>AI Subject Generator (Optional)</h2>
          <button className="segBtn" type="button" onClick={() => setShowAIGen((s) => !s)}>
            {showAIGen ? "Hide" : "Show"}
          </button>
        </div>

        {!showAIGen ? (
          <div className="hint" style={{ marginTop: 8 }}>
            Hidden by default (not required for exam portal experience).
          </div>
        ) : (
          <>
            <div className="hint" style={{ marginTop: 8, marginBottom: 10 }}>
              Generates via <b>/api/ai/generate</b> in <b>subject</b> mode (dev utility).
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

              <div className="card" style={{ marginTop: 6 }}>
                <div className="cardTitle">Latest AI response</div>

                {aiGen && Array.isArray(aiGen?.questions) ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ fontSize: 13, opacity: 0.9 }}>
                      Returned: <b>{aiGen.questions.length}</b> questions • Subject:{" "}
                      <b>{safeText(aiGen.subject, aiSubject)}</b> • Topic: <b>{safeText(aiGen.topic, aiTopic)}</b>
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      Expected difficulty: <b>{normalizeDifficulty(aiDifficulty)}</b>
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
                              #{p.i + 1} • <b>{safeText(p.type)}</b> • difficulty=<b>{safeText(p.difficulty, "—")}</b> •{" "}
                              {safeText(p.subject)} • {safeText(p.topic)}
                            </div>
                            <div style={{ marginTop: 6, fontSize: 13 }}>{safeText(p.question)}</div>
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
          </>
        )}
      </section>

      <hr className="sep" />

      {/* HISTORY */}
      <section className="tile">
        <h2>History</h2>

        {filteredHistory.length ? (
          <div className="histList">
            {filteredHistory.map((h, idx) => {
              const total =
                h?.totalQuestions ?? h?.totalquestions ?? h?.total ?? h?.total_questions ?? "—";
              return (
                <div className="histItem" key={h?.id ?? idx}>
                  <div className="histLeft">
                    <div className="histTop">
                      <b>Score:</b> {formatScore(h?.score)} <span className="dot">•</span>{" "}
                      <b>Accuracy:</b> {formatPct(h?.accuracy)}
                    </div>
                    <div className="histBottom">
                      Total: {safeText(total)} <span className="dot">•</span>{" "}
                      Time: {formatDateISO(h?.created_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="naBox">N/A</div>
        )}
      </section>
    </div>
  );
}
