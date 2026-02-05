// FILE: ~/gate-frontend/src/Dashboard.jsx
import React, { useMemo, useState } from "react";

/**
 * Dashboard layout:
 * main window
 *  ├─ top
 *  │   ├─ t1 (Latest test pie)
 *  │   └─ t2 (Average stats)
 *  ├─ mid
 *  └─ bottom
 *
 * "type" selector:
 * - default: main
 * - subject-wise option included, subject dropdown shown only when subject-wise selected
 *
 * If no data for selected type -> show N/A in tiles
 */

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function Pie({ correct = 0, total = 0 }) {
  if (!total || total <= 0) {
    return (
      <div style={{ padding: 12, textAlign: "center", opacity: 0.7 }}>
        N/A
      </div>
    );
  }

  const r = 46;
  const c = 2 * Math.PI * r;
  const pct = clamp(correct / total, 0, 1);
  const dash = c * pct;
  const gap = c - dash;

  return (
    <div style={{ display: "grid", placeItems: "center", gap: 10 }}>
      <svg width="140" height="140" viewBox="0 0 120 120">
        {/* base ring */}
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="rgba(0,0,0,0.10)"
          strokeWidth="14"
        />
        {/* correct arc */}
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
        {/* center text */}
        <text
          x="60"
          y="56"
          textAnchor="middle"
          fontSize="16"
          fontWeight="700"
        >
          {Math.round(pct * 100)}%
        </text>
        <text x="60" y="74" textAnchor="middle" fontSize="10" opacity="0.7">
          Accuracy
        </text>
      </svg>

      <div style={{ display: "flex", gap: 14, fontSize: 13, opacity: 0.9 }}>
        <span>
          ✅ {correct}/{total}
        </span>
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
  // type selector: "main" or "subject"
  const [mode, setMode] = useState("main"); // default: main
  const [subject, setSubject] = useState("Networks"); // used only in subject mode (placeholder)

  /**
   * IMPORTANT:
   * Your current backend history rows likely don't store mode/subject yet.
   * This filter supports future fields:
   * - row.mode === "main" | "subject"
   * - row.subject === "Networks" etc
   * If not present, it will treat everything as "main" for now.
   */
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

  const latestAcc =
    latest?.accuracy != null ? Number(latest.accuracy) : null;

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
              <select
                className="sel"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                {/* placeholder subjects (adjust later) */}
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
                <div>Score: <b>{latest?.score ?? "N/A"}</b></div>
                <div>Accuracy: <b>{latest?.accuracy ?? "N/A"}</b></div>
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
            <button
              className="primaryBtn"
              onClick={() => onStartSubject(subject)}
              type="button"
            >
              Start {subject} Mock (65)
            </button>
          )}

          <div className="hint">
            No “number of questions” selector — always 65 (Main: 10 GA + 55 EC).
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
                    <b>Score:</b> {h?.score ?? "—"}{" "}
                    <span className="dot">•</span>{" "}
                    <b>Accuracy:</b> {h?.accuracy ?? "—"}
                  </div>
                  <div className="histBottom">
                    Total: {h?.totalQuestions ?? h?.totalquestions ?? "—"}{" "}
                    <span className="dot">•</span>{" "}
                    Time:{" "}
                    {h?.created_at
                      ? new Date(h.created_at).toISOString()
                      : "—"}
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
