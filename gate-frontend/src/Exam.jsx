// FILE: ~/gate-frontend/src/Exam.jsx
import React, { useEffect, useMemo, useState } from "react";
import { create } from "zustand";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/* -------------------------
   Zustand Exam Store
------------------------- */
export const useExamStore = create((set, get) => ({
  current: 0,
  answers: {}, // { [qid]: "A" | ["A","C"] | "12.5" }
  review: {}, // { [qid]: true }
  visited: {}, // { [qid]: true }

  setCurrent: (idx) => set({ current: idx }),

  markVisited: (qid) =>
    set((s) => ({
      visited: { ...s.visited, [qid]: true },
    })),

  setAnswer: (qid, val) =>
    set((s) => ({
      answers: { ...s.answers, [qid]: val },
    })),

  clearAnswer: (qid) =>
    set((s) => {
      const next = { ...s.answers };
      delete next[qid];
      return { answers: next };
    }),

  setReview: (qid, flag) =>
    set((s) => ({
      review: { ...s.review, [qid]: !!flag },
    })),

  resetExam: () =>
    set({
      current: 0,
      answers: {},
      review: {},
      visited: {},
    }),

  getAnswerFor: (qid) => get().answers[qid],
}));

/* -------------------------
   Exam Component
   - GE / EC separated (GATE-like)
------------------------- */
export default function Exam({ token, questions = [], meta, onBack, onSubmit }) {
  const {
    current,
    setCurrent,
    answers,
    review,
    visited,
    markVisited,
    setAnswer,
    clearAnswer,
    setReview,
    resetExam,
  } = useExamStore();

  const [timeLeftSec, setTimeLeftSec] = useState(60 * 60);
  const [submitting, setSubmitting] = useState(false);

  // Section tab like GATE portal
  const [sectionTab, setSectionTab] = useState("GE"); // "GE" | "EC"

  const total = questions.length;
  const q = questions[current] || null;

  const questionsBySection = useMemo(() => {
    const ge = [];
    const ec = [];
    for (const it of questions) {
      const s = String(it?.section || "").toUpperCase();
      if (s === "GE") ge.push(it);
      else ec.push(it); // default to EC if missing
    }
    return { GE: ge, EC: ec };
  }, [questions]);

  const idxMaps = useMemo(() => {
    // Map section-local index -> global index
    const geMap = [];
    const ecMap = [];
    questions.forEach((it, globalIdx) => {
      const s = String(it?.section || "").toUpperCase();
      if (s === "GE") geMap.push(globalIdx);
      else ecMap.push(globalIdx);
    });
    return { GE: geMap, EC: ecMap };
  }, [questions]);

  // Auto-set tab based on first question section
  useEffect(() => {
    if (!questions.length) return;
    const s0 = String(questions[0]?.section || "").toUpperCase();
    setSectionTab(s0 === "GE" ? "GE" : "EC");
  }, [questions]);

  // Init exam when questions change
  useEffect(() => {
    resetExam();
    setTimeLeftSec(60 * 60);

    if (questions.length) {
      setCurrent(0);
      markVisited(questions[0]?.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(questions.map((x) => x?.id ?? ""))]);

  // Timer
  useEffect(() => {
    if (!total) return;
    const t = setInterval(() => {
      setTimeLeftSec((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [total]);

  const timeText = useMemo(() => {
    const s = Math.max(0, timeLeftSec);
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }, [timeLeftSec]);

  function goto(globalIdx) {
    const next = clamp(globalIdx, 0, total - 1);
    setCurrent(next);
    const nextQ = questions[next];
    if (nextQ) markVisited(nextQ.id);

    // keep section tab synced with current question
    const s = String(nextQ?.section || "").toUpperCase();
    setSectionTab(s === "GE" ? "GE" : "EC");
  }

  function gotoInTab(localIdx) {
    const map = idxMaps[sectionTab] || [];
    const globalIdx = map[clamp(localIdx, 0, map.length - 1)];
    if (globalIdx != null) goto(globalIdx);
  }

  function saveAndNext() {
    if (!q) return;
    setReview(q.id, false);
    goto(current + 1);
  }

  function markForReviewAndNext() {
    if (!q) return;
    setReview(q.id, true);
    goto(current + 1);
  }

  function clearResponse() {
    if (!q) return;
    clearAnswer(q.id);
  }

  function selectMcq(optKey) {
    if (!q) return;
    setAnswer(q.id, optKey);
  }

  function toggleMsq(optKey) {
    if (!q) return;
    const prev = answers[q.id];
    const arr = Array.isArray(prev) ? prev.slice() : [];
    const i = arr.indexOf(optKey);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(optKey);
    arr.sort();
    setAnswer(q.id, arr);
  }

  function setNat(val) {
    if (!q) return;
    setAnswer(q.id, String(val ?? ""));
  }

  async function submitTest(isAuto = false) {
    if (submitting) return;

    if (!token) {
      alert("Missing token. Please login again.");
      return;
    }
    if (!onSubmit) {
      alert("onSubmit missing (frontend wiring bug)");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        answers,
        totalQuestions: total,
        remainingTime: timeLeftSec,
      });

      alert(isAuto ? "Time up! Test submitted." : "Test submitted ✅");
    } catch (e) {
      alert(e?.message || "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  // Auto submit at 0
  useEffect(() => {
    if (total > 0 && timeLeftSec === 0) submitTest(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeftSec, total]);

  if (!total) {
    return (
      <div style={{ padding: 18 }}>
        <div style={styles.header}>
          <div style={styles.title}>Exam</div>
          <div style={styles.headerRight}>
            <div style={styles.timer}>Time Left: {timeText}</div>
            <button style={styles.btn} onClick={onBack}>
              Exit
            </button>
          </div>
        </div>
        <div style={styles.card}>No questions loaded.</div>
      </div>
    );
  }

  if (!q) {
    return (
      <div style={{ padding: 18 }}>
        <div style={styles.header}>
          <div style={styles.title}>Exam</div>
          <div style={styles.headerRight}>
            <div style={styles.timer}>Time Left: {timeText}</div>
            <button style={styles.btn} onClick={onBack}>
              Exit
            </button>
          </div>
        </div>
        <div style={styles.card}>No question found.</div>
      </div>
    );
  }

  const qid = q.id;
  const ans = answers[qid];
  const type = (q.type || "MCQ").toUpperCase();
  const section = String(q.section || "").toUpperCase() === "GE" ? "GE" : "EC";

  const map = idxMaps[sectionTab] || [];
  const localIndexInTab = map.indexOf(current); // -1 if mismatch
  const localPos = localIndexInTab >= 0 ? localIndexInTab + 1 : 0;
  const localTotal = map.length;

  const palette = map.map((globalIdx, localIdx) => {
    const it = questions[globalIdx];
    const a = answers[it.id];
    const answered =
      a !== undefined &&
      a !== null &&
      (typeof a === "string"
        ? a.trim() !== ""
        : Array.isArray(a)
        ? a.length > 0
        : true);

    const r = !!review[it.id];
    const v = !!visited[it.id];

    let bg = "#f1f5f9";
    let bd = "#e2e8f0";
    let color = "#0f172a";

    if (v) {
      bg = "#e8f0ff";
      bd = "#c7d2fe";
    }
    if (answered) {
      bg = "#dcfce7";
      bd = "#86efac";
    }
    if (r) {
      bg = "#ffedd5";
      bd = "#fdba74";
    }
    if (globalIdx === current) bd = "#111827";

    return { localIdx, bg, bd, color, globalIdx };
  });

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div style={styles.title}>
          Exam{meta?.mode ? ` • ${meta.mode}` : ""} • {section} • {meta?.difficulty ? meta.difficulty : ""}
        </div>
        <div style={styles.headerRight}>
          <div style={styles.timer}>Time Left: {timeText}</div>
          <button style={styles.btn} onClick={onBack}>
            Exit
          </button>
        </div>
      </div>

      <div style={styles.grid}>
        <div>
          <div style={styles.card}>
            <div style={styles.qTop}>
              <div>
                <div style={styles.qNo}>
                  {section} Question {localPos} / {localTotal}{" "}
                  <span style={{ opacity: 0.55, fontWeight: 800 }}>
                    (Overall {current + 1}/{total})
                  </span>
                </div>
                <div style={styles.qMeta}>
                  <span style={styles.badge}>{q.subject || "Unknown"}</span>
                  {q.topic ? <span style={styles.badgeMuted}>{q.topic}</span> : null}
                  <span style={styles.badgeMuted}>{type}</span>
                  <span style={styles.badgeMuted}>Section: {section}</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  type="button"
                  style={{ ...styles.segBtn, ...(sectionTab === "GE" ? styles.segBtnActive : null) }}
                  onClick={() => setSectionTab("GE")}
                >
                  GE ({idxMaps.GE.length})
                </button>
                <button
                  type="button"
                  style={{ ...styles.segBtn, ...(sectionTab === "EC" ? styles.segBtnActive : null) }}
                  onClick={() => setSectionTab("EC")}
                >
                  EC ({idxMaps.EC.length})
                </button>
              </div>
            </div>

            <div style={styles.qText}>{q.question}</div>

            <div style={{ marginTop: 14 }}>
              {type === "MCQ" && q.options ? (
                <div style={styles.optList}>
                  {Object.entries(q.options)
                    .filter(([k, v]) => ["A", "B", "C", "D", "E"].includes(k) && String(v ?? "").trim() !== "")
                    .map(([k, v]) => (
                      <label key={k} style={styles.optItem}>
                        <input type="radio" name={`mcq-${qid}`} checked={ans === k} onChange={() => selectMcq(k)} />
                        <span style={styles.optKey}>{k}.</span>
                        <span>{String(v)}</span>
                      </label>
                    ))}
                </div>
              ) : null}

              {type === "MSQ" && q.options ? (
                <div style={styles.optList}>
                  {Object.entries(q.options)
                    .filter(([k, v]) => ["A", "B", "C", "D", "E"].includes(k) && String(v ?? "").trim() !== "")
                    .map(([k, v]) => {
                      const arr = Array.isArray(ans) ? ans : [];
                      const checked = arr.includes(k);
                      return (
                        <label key={k} style={styles.optItem}>
                          <input type="checkbox" checked={checked} onChange={() => toggleMsq(k)} />
                          <span style={styles.optKey}>{k}.</span>
                          <span>{String(v)}</span>
                        </label>
                      );
                    })}
                </div>
              ) : null}

              {type === "NAT" ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={styles.smallMuted}>Enter numeric answer (decimals allowed).</div>
                  <input
                    style={styles.natInput}
                    value={typeof ans === "string" ? ans : ""}
                    onChange={(e) => setNat(e.target.value)}
                    placeholder="Type your answer…"
                    inputMode="decimal"
                  />
                </div>
              ) : null}
            </div>

            <div style={styles.actions}>
              <button style={styles.btn} onClick={clearResponse}>
                Clear Response
              </button>
              <button style={styles.btn} onClick={markForReviewAndNext}>
                Mark for Review & Next
              </button>
              <button style={styles.btnPrimary} onClick={saveAndNext} disabled={current >= total - 1}>
                Save & Next
              </button>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <button style={styles.btnDanger} onClick={() => submitTest(false)} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit Test"}
            </button>
          </div>
        </div>

        <div>
          <div style={styles.card}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Question Palette ({sectionTab})</div>

            <div style={styles.legend}>
              <span style={{ ...styles.legendItem, background: "#dcfce7", borderColor: "#86efac" }}>Answered</span>
              <span style={{ ...styles.legendItem, background: "#e8f0ff", borderColor: "#c7d2fe" }}>Visited</span>
              <span style={{ ...styles.legendItem, background: "#ffedd5", borderColor: "#fdba74" }}>Review</span>
              <span style={{ ...styles.legendItem, background: "#f1f5f9", borderColor: "#e2e8f0" }}>Not visited</span>
            </div>

            <div style={styles.palette}>
              {palette.map((p) => (
                <button
                  key={`${sectionTab}-${p.localIdx}`}
                  style={{ ...styles.pill, background: p.bg, borderColor: p.bd, color: p.color }}
                  onClick={() => goto(p.globalIdx)}
                >
                  {p.localIdx + 1}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
              <button
                style={styles.btn}
                onClick={() => gotoInTab((localIndexInTab >= 0 ? localIndexInTab : 0) - 1)}
                disabled={localIndexInTab <= 0}
              >
                Previous
              </button>
              <button
                style={styles.btn}
                onClick={() => gotoInTab((localIndexInTab >= 0 ? localIndexInTab : 0) + 1)}
                disabled={localIndexInTab >= localTotal - 1}
              >
                Next
              </button>
            </div>

            <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
              Tip: Switch tabs to jump between GE and EC like the real GATE portal.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------
   Styles
------------------------- */
const styles = {
  wrap: {
    minHeight: "100vh",
    background: "#ffffff",
    color: "#0f172a",
    padding: 18,
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"',
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerRight: { display: "flex", gap: 10, alignItems: "center" },
  title: { fontSize: 18, fontWeight: 900 },
  timer: {
    padding: "6px 10px",
    borderRadius: 10,
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
    fontWeight: 800,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 360px",
    gap: 14,
    alignItems: "start",
  },
  card: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
  },
  qTop: { display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 },
  qMeta: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 },
  badge: {
    padding: "4px 10px",
    borderRadius: 999,
    background: "#e8f0ff",
    border: "1px solid #c7d2fe",
    fontSize: 12,
    fontWeight: 800,
  },
  badgeMuted: {
    padding: "4px 10px",
    borderRadius: 999,
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
    fontSize: 12,
    fontWeight: 700,
    opacity: 0.9,
  },
  qNo: { fontSize: 16, fontWeight: 900 },
  qText: {
    whiteSpace: "pre-wrap",
    lineHeight: 1.45,
    fontSize: 15,
    paddingTop: 10,
    borderTop: "1px solid #eef2f7",
  },
  optList: { display: "grid", gap: 10 },
  optItem: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: 10,
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#ffffff",
  },
  optKey: { fontWeight: 900, minWidth: 22 },
  natInput: {
    width: "100%",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    padding: "10px 12px",
    fontSize: 16,
    outline: "none",
  },
  actions: {
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 16,
    flexWrap: "wrap",
  },
  btn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
  },
  btnPrimary: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #111827",
    background: "#111827",
    color: "#ffffff",
    fontWeight: 900,
    cursor: "pointer",
  },
  btnDanger: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #b00020",
    background: "#b00020",
    color: "#ffffff",
    fontWeight: 900,
    cursor: "pointer",
  },
  smallMuted: { fontSize: 12, opacity: 0.75 },
  palette: { display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginTop: 10 },
  pill: {
    padding: "10px 0",
    borderRadius: 12,
    border: "2px solid #e5e7eb",
    fontWeight: 900,
    cursor: "pointer",
  },
  legend: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 },
  legendItem: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid",
    fontSize: 12,
    fontWeight: 800,
  },
  segBtn: {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.15)",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
  },
  segBtnActive: {
    background: "#111827",
    color: "white",
    border: "1px solid #111827",
  },
};
