// FILE: ~/gate-frontend/src/Dashboard.jsx
import React, { useMemo, useState } from "react";
import { apiFetch } from "./api.js";
import { useAuthStore } from "./authStore.js";

/**
 * Stage-6B (Option A) — Subject mode only (simpler & safer)
 * Adds Difficulty dropdown + AI generate in subject mode only.
 * Does NOT change existing Stage-4/5 flows.
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

export default function Dashboard({
  history = [],
  onStartMain = () => {},
  onStartSubject = (_subject) => {},
}) {
  const token = useAuthStore((s) => s.token);

  // type selector: "main" or "subject"
  const [mode, setMode] = useState("main"); // default: main
  const [subject, setSubject] = useState("Networks"); // subject mode selection

  // Stage-6B: Difficulty selection + AI generation controls (subject mode only)
  const [difficulty, setDifficulty] = useState("medium"); // easy|medium|hard
  const [aiTopic, setAiTopic] = useState("Basics");
  const [aiCount, setAiCount] = useState(5);
  const [aiProvider, setAiProvider] = useState("openai"); // openai|auto|local (backend supports)

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiResult, setAiResult] = useState(null);

  const [importLoading, setImportLoading] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  /**
   * History filter:
   * - supports future fields row.mode / row.subject
   * - if not present, treats as main
   */
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
    latest?.totalquestions ??
    latest?.totalQuestions ??
    latest?.total ??
    latest?.total_questions ??
    null;

  const latestAcc = latest?.accuracy != null ? Number(latest.accuracy) : null;

  const latestCorrect =
    latestAcc != null && latestTotal
      ? Math.round((latestAcc / 100) * Number(latestTotal))
      : 0;

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

  async function onGenerateAI() {
    setAiError("");
    setImportMsg("");
    setAiResult(null);

    if (!token) {
      setAiError("Missing token. Please login again.");
      return;
    }
    if (mode !== "subject") {
      setAiError("AI Subject Generation is only enabled in Subject-wise mode (Stage-6B Option A).");
      return;
    }

    const d = String(difficulty || "medium").toLowerCase();
    const allowed = new Set(["easy", "medium", "hard"]);
    const diff = allowed.has(d) ? d : "medium";

    const countNum = clamp(parseInt(aiCount, 10) || 5, 1, 100);
    const topic = String(aiTopic || "Mixed").trim() || "Mixed";

    setAiLoading(true);
    try {
      const data = await apiFetch("/ai/generate", {
        token,
        method: "POST",
        body: {
          provider: aiProvider,
          mode: "subject",
          subject,
          topic,
          count: countNum,
          difficulty: diff, // ✅ Stage-6B requirement
        },
      });

      setAiResult(data);
    } catch (e) {
      setAiError(e?.message || "AI generation failed");
    } finally {
      setAiLoading(false);
    }
  }

  async function onImportAI() {
    setImportMsg("");
    setAiError("");

    if (!token) {
      setAiError("Missing token. Please login again.");
      return;
    }
    const qs = aiResult?.questions;
    if (!Array.isArray(qs) || !qs.length) {
      setAiError("No generated questions found to import.");
      return;
    }

    setImportLoading(true);
    try {
      // Your importer can work without defaults now (Stage-5 Clean),
      // but we still provide defaults as extra safety.
      const resp = await apiFetch("/questions/import", {
        token,
        method: "POST",
        body: {
          defaultSubject: subject,
          defaultTopic: String(aiTopic || "Mixed").trim() || "Mixed",
          questions: qs,
        },
      });

      setImportMsg(`Imported ✅ inserted=${resp?.inserted ?? "?"}`);
    } catch (e) {
      setAiError(e?.message || "Import failed");
    } finally {
      setImportLoading(false);
    }
  }

  // small helper to show quick validation that difficulty matches selection
  const diffMismatch = useMemo(() => {
    const wanted = String(difficulty || "").toLowerCase();
    const qs = aiResult?.questions;
    if (!wanted || !Array.isArray(qs) || !qs.length) return false;
    return qs.some((q) => String(q?.difficulty || "").toLowerCase() !== wanted);
  }, [aiResult, difficulty]);

  return (
    <div className="dashWrap">
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
                <option>Networks</option>
                <option>Digital Electronics</option>
                <option>Control Systems</option>
                <option>Signals and Systems</option>
                <option>Analog Circuits</option>
                <option>Communication</option>
                <option>Electromagnetics</option>
                <option>Electronic Devices</option>
                <option>Engineering Mathematics</option>
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

        <div className="startRow">
          {mode === "main" ? (
            <button className="primaryBtn" onClick={onStartMain} type="button">
              Start Main Mock (65)
            </button>
          ) : (
            <button className="primaryBtn" onClick={() => onStartSubject(subject)} type="button">
              Start {subject} Mock (65)
            </button>
          )}

          <div className="hint">No “number of questions” selector — always 65 (Main: 10 GA + 55 EC).</div>
        </div>
      </section>

      {/* Stage-6B Option A: Subject mode only */}
      {mode === "subject" && (
        <>
          <hr className="sep" />

          <section className="tile">
            <h2>AI Subject Generation (Stage-6B)</h2>

            <div className="startRow" style={{ alignItems: "flex-start" }}>
              <div style={{ display: "grid", gap: 10, minWidth: 320 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div className="hint" style={{ margin: 0 }}>
                    Generate AI questions for <b>{subject}</b> and optionally import into DB.
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 700 }}>Difficulty</div>
                    <select className="sel" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                      <option value="easy">easy</option>
                      <option value="medium">medium</option>
                      <option value="hard">hard</option>
                    </select>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 700 }}>Provider</div>
                    <select className="sel" value={aiProvider} onChange={(e) => setAiProvider(e.target.value)}>
                      <option value="openai">openai</option>
                      <option value="auto">auto</option>
                      <option value="local">local</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 700 }}>Topic</div>
                    <input
                      className="sel"
                      style={{ padding: "10px 12px" }}
                      value={aiTopic}
                      onChange={(e) => setAiTopic(e.target.value)}
                      placeholder="e.g., Basics"
                    />
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 700 }}>Count</div>
                    <input
                      className="sel"
                      style={{ padding: "10px 12px" }}
                      value={aiCount}
                      onChange={(e) => setAiCount(e.target.value)}
                      inputMode="numeric"
                      placeholder="5"
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="primaryBtn" onClick={onGenerateAI} type="button" disabled={aiLoading}>
                    {aiLoading ? "Generating…" : "Generate AI Questions"}
                  </button>

                  <button
                    className="primaryBtn"
                    onClick={onImportAI}
                    type="button"
                    disabled={importLoading || !Array.isArray(aiResult?.questions) || !aiResult?.questions?.length}
                    style={{
                      background: "white",
                      color: "black",
                      border: "1px solid rgba(0,0,0,0.15)",
                    }}
                  >
                    {importLoading ? "Importing…" : "Import into DB"}
                  </button>

                  <button
                    className="primaryBtn"
                    onClick={() => {
                      setAiError("");
                      setImportMsg("");
                      setAiResult(null);
                    }}
                    type="button"
                    style={{
                      background: "white",
                      color: "black",
                      border: "1px solid rgba(0,0,0,0.15)",
                    }}
                  >
                    Clear
                  </button>
                </div>

                {aiError ? <div className="naBox" style={{ color: "#b00020" }}>{aiError}</div> : null}
                {importMsg ? <div className="naBox" style={{ color: "green" }}>{importMsg}</div> : null}

                {aiResult && (
                  <div className="naBox" style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Result</div>
                    <div style={{ fontSize: 13, opacity: 0.9 }}>
                      subject=<b>{aiResult?.subject ?? subject}</b>, topic=<b>{aiResult?.topic ?? aiTopic}</b>, count=
                      <b>{aiResult?.questions?.length ?? 0}</b>, selected difficulty=<b>{difficulty}</b>
                    </div>
                    {diffMismatch ? (
                      <div style={{ marginTop: 8, fontSize: 13, color: "#b00020", fontWeight: 800 }}>
                        ⚠️ Difficulty mismatch detected in response. (At least one question.difficulty differs.)
                      </div>
                    ) : (
                      <div style={{ marginTop: 8, fontSize: 13, color: "green", fontWeight: 800 }}>
                        ✅ Difficulty matches selection (quick check).
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right side preview */}
              <div style={{ flex: 1 }}>
                <div className="card">
                  <div className="cardTitle">Preview (first 2 questions)</div>

                  {!aiResult?.questions?.length ? (
                    <div className="naBox">N/A</div>
                  ) : (
                    <div style={{ display: "grid", gap: 12 }}>
                      {aiResult.questions.slice(0, 2).map((q, i) => (
                        <div
                          key={i}
                          style={{
                            border: "1px solid rgba(0,0,0,0.10)",
                            borderRadius: 12,
                            padding: 12,
                          }}
                        >
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>
                              {q?.type ?? "MCQ"}
                            </span>
                            <span style={{ fontSize: 12, opacity: 0.7 }}>
                              difficulty: <b>{q?.difficulty ?? "—"}</b>
                            </span>
                          </div>

                          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
                            {q?.question ?? "—"}
                          </div>

                          {q?.options && typeof q.options === "object" ? (
                            <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 13, opacity: 0.9 }}>
                              {["A", "B", "C", "D"].map((k) => (
                                <div key={k}>
                                  <b>{k}.</b> {String(q.options?.[k] ?? "")}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Debug JSON (optional) */}
                  {aiResult ? (
                    <details style={{ marginTop: 12 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 800 }}>Raw JSON</summary>
                      <pre
                        style={{
                          marginTop: 10,
                          padding: 12,
                          background: "#f6f7f8",
                          borderRadius: 12,
                          border: "1px solid rgba(0,0,0,0.08)",
                          overflow: "auto",
                          maxHeight: 280,
                          fontSize: 12,
                        }}
                      >
                        {JSON.stringify(aiResult, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        </>
      )}

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
                    Total: {h?.totalQuestions ?? h?.totalquestions ?? "—"} <span className="dot">•</span> Time:{" "}
                    {h?.created_at ? new Date(h.created_at).toISOString() : "—"}
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
