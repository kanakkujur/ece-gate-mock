// FILE: ~/gate-frontend/src/DesignReview.jsx
import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api.js";

function deriveSection(q) {
  const s = (q?.section || "").trim().toUpperCase();
  if (s === "GE" || s === "EC") return s;
  const subj = String(q?.subject || "").toLowerCase();
  if (subj.includes("general aptitude")) return "GE";
  return "EC";
}

function normalizeUserAnswer(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.slice().sort().join(", ");
  if (typeof v === "object") {
    // sometimes backend stores {type, answer}
    if ("answer" in v) return normalizeUserAnswer(v.answer);
    return JSON.stringify(v);
  }
  return String(v);
}

function normalizeCorrectAnswer(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.slice().sort().join(", ");
  return String(v);
}

function hasAttempt(v) {
  if (v === undefined || v === null) return false;
  if (typeof v === "object" && !Array.isArray(v) && v !== null) {
    if ("answer" in v) return hasAttempt(v.answer);
    return true;
  }
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim() !== "";
  return true;
}

function isCorrect(q, userRaw) {
  if (!hasAttempt(userRaw)) return false;
  const user = normalizeUserAnswer(userRaw).replace(/\s+/g, "").toUpperCase();
  const ans = normalizeCorrectAnswer(q?.answer).replace(/\s+/g, "").toUpperCase();
  return user !== "" && ans !== "" && user === ans;
}

function SectionBadge({ sec }) {
  const isGE = sec === "GE";
  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 900,
        border: "1px solid",
        background: isGE ? "#fff7ed" : "#e8f0ff",
        borderColor: isGE ? "#fdba74" : "#c7d2fe",
      }}
    >
      {isGE ? "GA (GE)" : "ECE (EC)"}
    </span>
  );
}

export default function DesignReview({ token, testId, onBack }) {
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState(null);
  const [err, setErr] = useState(null);

  const [activeSection, setActiveSection] = useState("GE");
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (!token || !testId) return;

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await apiFetch(`/test/${testId}/review`, { token });
        setReview(data);
      } catch (e) {
        setErr(e?.message || "Failed to load review");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, testId]);

  const questions = useMemo(() => {
    const qs = review?.questions;
    return Array.isArray(qs) ? qs : [];
  }, [review]);

  const answers = useMemo(() => {
    // backend stores test_sessions.answers as jsonb, sometimes { "1": {...}, "2": {...} } OR { [qid]: {...} }
    return review?.answers && typeof review.answers === "object" ? review.answers : {};
  }, [review]);

  const grouped = useMemo(() => {
    const ge = [];
    const ec = [];
    for (const q of questions) {
      const sec = deriveSection(q);
      if (sec === "GE") ge.push(q);
      else ec.push(q);
    }
    return { GE: ge, EC: ec };
  }, [questions]);

  const list = activeSection === "GE" ? grouped.GE : grouped.EC;

  useEffect(() => {
    // if current active section has no questions (rare), flip
    if (activeSection === "GE" && grouped.GE.length === 0 && grouped.EC.length) setActiveSection("EC");
    if (activeSection === "EC" && grouped.EC.length === 0 && grouped.GE.length) setActiveSection("GE");
  }, [grouped, activeSection]);

  useEffect(() => {
    setActiveIdx(0);
  }, [activeSection, testId]);

  const activeQ = list[activeIdx] || null;

  const stats = useMemo(() => {
    let correct = 0;
    let wrong = 0;
    let skipped = 0;

    for (const q of questions) {
      const keyById = q?.id != null ? String(q.id) : null;
      const keyByNum = q?.question_number != null ? String(q.question_number) : null;

      const user = (keyById && answers[keyById]) || (keyByNum && answers[keyByNum]) || null;

      if (!hasAttempt(user)) {
        skipped++;
      } else if (isCorrect(q, user)) {
        correct++;
      } else {
        wrong++;
      }
    }

    const total = questions.length || 0;
    return { total, correct, wrong, skipped };
  }, [questions, answers]);

  if (!testId) {
    return (
      <div style={{ padding: 18, fontFamily: "system-ui" }}>
        <div style={{ marginBottom: 12, fontWeight: 900 }}>Review</div>
        <div style={box}>No test selected.</div>
        <button style={btn} onClick={onBack}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={top}>
        <div style={{ display: "grid" }}>
          <div style={{ fontWeight: 1000, fontSize: 18 }}>Test Review</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            testId=<b>{testId}</b> • score=<b>{review?.score ?? "—"}</b> • accuracy=<b>{review?.accuracy ?? "—"}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={pill}>Total: {stats.total}</div>
          <div style={pill}>✅ {stats.correct}</div>
          <div style={pill}>❌ {stats.wrong}</div>
          <div style={pill}>⏭ {stats.skipped}</div>

          <button style={btn} onClick={onBack}>
            Back
          </button>
        </div>
      </div>

      {loading ? <div style={box}>Loading review…</div> : null}
      {err ? <div style={{ ...box, borderColor: "#fecaca", background: "#fff1f2" }}>{err}</div> : null}

      {!loading && !err && review ? (
        <div style={grid}>
          <div style={panel}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
              <button
                type="button"
                style={{
                  ...tab,
                  background: activeSection === "GE" ? "#111827" : "#fff",
                  color: activeSection === "GE" ? "#fff" : "#111827",
                }}
                onClick={() => setActiveSection("GE")}
              >
                GA (GE) • {grouped.GE.length}
              </button>
              <button
                type="button"
                style={{
                  ...tab,
                  background: activeSection === "EC" ? "#111827" : "#fff",
                  color: activeSection === "EC" ? "#fff" : "#111827",
                }}
                onClick={() => setActiveSection("EC")}
              >
                ECE (EC) • {grouped.EC.length}
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
              {list.map((q, idx) => {
                const keyById = q?.id != null ? String(q.id) : null;
                const keyByNum = q?.question_number != null ? String(q.question_number) : null;
                const user = (keyById && answers[keyById]) || (keyByNum && answers[keyByNum]) || null;

                const attempted = hasAttempt(user);
                const correct = attempted ? isCorrect(q, user) : false;

                let bg = "#f1f5f9";
                let bd = "#e2e8f0";
                if (attempted && correct) {
                  bg = "#dcfce7";
                  bd = "#86efac";
                } else if (attempted && !correct) {
                  bg = "#ffe4e6";
                  bd = "#fda4af";
                }
                if (idx === activeIdx) bd = "#111827";

                return (
                  <button
                    key={`${activeSection}-${q.id ?? idx}`}
                    style={{
                      padding: "10px 0",
                      borderRadius: 12,
                      border: `2px solid ${bd}`,
                      background: bg,
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                    onClick={() => setActiveIdx(idx)}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={panel}>
            {!activeQ ? (
              <div style={box}>No question.</div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <SectionBadge sec={deriveSection(activeQ)} />
                    <span style={pill}>{activeQ.subject || "Unknown"}</span>
                    {activeQ.topic ? <span style={pillMuted}>{activeQ.topic}</span> : null}
                    <span style={pillMuted}>{String(activeQ.type || "MCQ").toUpperCase()}</span>
                    <span style={pillMuted}>Marks: {activeQ.marks ?? "—"}</span>
                    <span style={pillMuted}>Neg: {activeQ.neg_marks ?? "—"}</span>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={btn} onClick={() => setActiveIdx((i) => Math.max(0, i - 1))} disabled={activeIdx <= 0}>
                      Prev
                    </button>
                    <button
                      style={btn}
                      onClick={() => setActiveIdx((i) => Math.min(list.length - 1, i + 1))}
                      disabled={activeIdx >= list.length - 1}
                    >
                      Next
                    </button>
                  </div>
                </div>

                <div style={qBox}>{activeQ.question}</div>

                {/* Options */}
                {activeQ.options ? (
                  <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                    {Object.entries(activeQ.options)
                      .filter(([k, v]) => ["A", "B", "C", "D", "E"].includes(k) && String(v ?? "").trim() !== "")
                      .map(([k, v]) => (
                        <div key={k} style={opt}>
                          <b style={{ minWidth: 28 }}>{k}.</b> <span>{String(v)}</span>
                        </div>
                      ))}
                  </div>
                ) : null}

                {/* Answer blocks */}
                <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                  {(() => {
                    const keyById = activeQ?.id != null ? String(activeQ.id) : null;
                    const keyByNum = activeQ?.question_number != null ? String(activeQ.question_number) : null;
                    const user = (keyById && answers[keyById]) || (keyByNum && answers[keyByNum]) || null;

                    const attempted = hasAttempt(user);
                    const correct = attempted ? isCorrect(activeQ, user) : false;

                    return (
                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                          <div
                            style={{
                              ...pill,
                              background: attempted ? (correct ? "#dcfce7" : "#ffe4e6") : "#f1f5f9",
                              borderColor: attempted ? (correct ? "#86efac" : "#fda4af") : "#e2e8f0",
                            }}
                          >
                            {attempted ? (correct ? "✅ Correct" : "❌ Wrong") : "⏭ Skipped"}
                          </div>

                          <div style={pillMuted}>
                            Your answer: <b>{attempted ? normalizeUserAnswer(user) : "—"}</b>
                          </div>

                          <div style={pillMuted}>
                            Correct: <b>{normalizeCorrectAnswer(activeQ.answer) || "—"}</b>
                          </div>
                        </div>

                        {activeQ.solution ? (
                          <div style={{ ...box, whiteSpace: "pre-wrap" }}>
                            <div style={{ fontWeight: 900, marginBottom: 6 }}>Solution</div>
                            <div style={{ opacity: 0.95 }}>{activeQ.solution}</div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const wrap = {
  minHeight: "100vh",
  background: "#fff",
  padding: 18,
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"',
  color: "#0f172a",
};

const top = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};

const grid = {
  display: "grid",
  gridTemplateColumns: "360px 1fr",
  gap: 14,
  alignItems: "start",
};

const panel = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
};

const tab = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  cursor: "pointer",
  fontWeight: 900,
};

const btn = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 800,
};

const pill = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#fff",
  fontSize: 12,
  fontWeight: 900,
};

const pillMuted = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#f8fafc",
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.9,
};

const box = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 12,
  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.04)",
};

const qBox = {
  marginTop: 12,
  whiteSpace: "pre-wrap",
  lineHeight: 1.5,
  borderTop: "1px solid #eef2f7",
  paddingTop: 12,
  fontSize: 15,
};

const opt = {
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
  padding: 10,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "#fff",
};
