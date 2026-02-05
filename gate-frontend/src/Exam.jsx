import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { apiFetch } from "./api";

/* -------------------------
   Helpers
------------------------- */
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function getStoredExamConfig() {
  try {
    const raw = localStorage.getItem("gate_exam_config");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* -------------------------
   Zustand Exam Store (in-file)
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

  toggleReview: (qid) =>
    set((s) => ({
      review: { ...s.review, [qid]: !s.review[qid] },
    })),

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

  /* Utility */
  getAnswerFor: (qid) => get().answers[qid],
  isReviewed: (qid) => !!get().review[qid],
  isVisited: (qid) => !!get().visited[qid],
}));

/* -------------------------
   Exam Component
------------------------- */
/**
 * Props expected (recommended):
 * - token: JWT string
 * - onBack: () => void
 * - config: { count:number, subjects:string[] }  (optional)
 *
 * If config not provided, it will try localStorage "gate_exam_config",
 * else default count=10 and subjects=[]
 */
export default function Exam({ token, onBack, config }) {
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

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [questions, setQuestions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeftSec, setTimeLeftSec] = useState(60 * 60); // 60 min default

  const effectiveConfig = useMemo(() => {
    const stored = getStoredExamConfig();
    const base = config || stored || {};
    const count = Number(base.count ?? 10);
    const subjects = Array.isArray(base.subjects) ? base.subjects : [];
    const durationMin = Number(base.durationMin ?? 60);
    return {
      count: clamp(isFinite(count) ? count : 10, 1, 200),
      subjects,
      durationMin: clamp(isFinite(durationMin) ? durationMin : 60, 5, 600),
    };
  }, [config]);

  const total = questions.length;
  const q = questions[current] || null;

  /* -------------------------
     Load questions
  ------------------------- */
  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setLoadErr("");
      resetExam();

      try {
        const qs = new URLSearchParams();
        qs.set("count", String(effectiveConfig.count));
        if (effectiveConfig.subjects.length) {
          qs.set("subjects", effectiveConfig.subjects.join(","));
        }

        // IMPORTANT: apiFetch base defaults to "/api"
        // So this hits: /api/test/generate?...
        const data = await apiFetch(`/test/generate?${qs.toString()}`, { token });

        const arr = Array.isArray(data?.questions) ? data.questions : [];
        if (!arr.length) throw new Error("No questions returned from API");

        // Normalize questions
        const normalized = arr.map((it, idx) => ({
          id: it.id ?? idx + 1,
          subject: it.subject ?? "Unknown",
          topic: it.topic ?? "",
          type: (it.type || "MCQ").toUpperCase(), // MCQ | MSQ | NAT
          marks: Number(it.marks ?? 1),
          neg_marks: Number(it.neg_marks ?? 0),
          question: String(it.question ?? ""),
          options: it.options && typeof it.options === "object" ? it.options : null,
          answer: it.answer ?? null, // backend may or may not send
          solution: it.solution ?? "",
          year: it.year ?? null,
          paper: it.paper ?? null,
          session: it.session ?? null,
          question_number: it.question_number ?? null,
          _idx: idx,
        }));

        if (!alive) return;
        setQuestions(normalized);
        setCurrent(0);
        markVisited(normalized[0].id);
        setTimeLeftSec(effectiveConfig.durationMin * 60);
      } catch (e) {
        if (!alive) return;
        setLoadErr(e?.message || "Failed to load test");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    if (!token) {
      setLoading(false);
      setLoadErr("Missing login token. Please login again.");
      return;
    }

    load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, effectiveConfig.count, effectiveConfig.durationMin, JSON.stringify(effectiveConfig.subjects)]);

  /* -------------------------
     Timer
  ------------------------- */
  useEffect(() => {
    if (loading || loadErr || !total) return;

    const t = setInterval(() => {
      setTimeLeftSec((s) => {
        if (s <= 1) return 0;
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(t);
  }, [loading, loadErr, total]);

  useEffect(() => {
    // auto-submit at time 0 (soft)
    if (!loading && !loadErr && total > 0 && timeLeftSec === 0) {
      // don’t spam
      // eslint-disable-next-line no-use-before-define
      submitTest(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeftSec, loading, loadErr, total]);

  const timeText = useMemo(() => {
    const s = Math.max(0, timeLeftSec);
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }, [timeLeftSec]);

  /* -------------------------
     UI actions
  ------------------------- */
  function goto(idx) {
    const next = clamp(idx, 0, total - 1);
    setCurrent(next);
    const nextQ = questions[next];
    if (nextQ) markVisited(nextQ.id);
  }

  function saveAndNext() {
    if (!q) return;
    // save happens live as user selects
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
    // allow empty
    const v = String(val ?? "");
    setAnswer(q.id, v);
  }

  /* -------------------------
     Submit
  ------------------------- */
  async function submitTest(isAuto = false) {
    if (submitting) return;
    if (!token) return;

    setSubmitting(true);
    try {
      // Prepare payload
      const payload = {
        answers: {},
        totalQuestions: total,
      };

      for (const item of questions) {
        const v = answers[item.id];
        if (v === undefined) continue;
        payload.answers[String(item.id)] = v;
      }

      // POST /api/test/submit
      const res = await apiFetch("/test/submit", {
        token,
        method: "POST",
        body: payload,
      });

      // You can show score if backend computes it.
      alert(
        isAuto
          ? "Time up! Test submitted."
          : `Test submitted.${res?.score != null ? ` Score: ${res.score}` : ""}`
      );

      if (onBack) onBack();
    } catch (e) {
      alert(e?.message || "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  /* -------------------------
     Render
  ------------------------- */
  if (loading) {
    return (
      <div style={styles.wrap}>
        <div style={styles.header}>
          <div style={styles.title}>GATE ECE Mock Platform</div>
          <div style={styles.timer}>Time Left: {timeText}</div>
        </div>
        <div style={styles.card}>Loading test…</div>
      </div>
    );
  }

  if (loadErr) {
    return (
      <div style={styles.wrap}>
        <div style={styles.header}>
          <div style={styles.title}>GATE ECE Mock Platform</div>
          <div style={styles.timer}>Time Left: {timeText}</div>
        </div>

        <div style={styles.card}>
          <div style={{ fontWeight: 800, color: "#b00020", marginBottom: 8 }}>
            Failed to load test
          </div>
          <div style={{ opacity: 0.9 }}>{loadErr}</div>
          <div style={{ marginTop: 14 }}>
            <button style={styles.btn} onClick={onBack}>
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!q) {
    return (
      <div style={styles.wrap}>
        <div style={styles.header}>
          <div style={styles.title}>GATE ECE Mock Platform</div>
          <div style={styles.timer}>Time Left: {timeText}</div>
        </div>
        <div style={styles.card}>
          No question found.
          <div style={{ marginTop: 14 }}>
            <button style={styles.btn} onClick={onBack}>
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const qid = q.id;
  const ans = answers[qid];
  const isReviewed = !!review[qid];
  const isVisited = !!visited[qid];

  const palette = questions.map((it, idx) => {
    const a = answers[it.id];
    const answered =
      a !== undefined &&
      a !== null &&
      (typeof a === "string" ? a.trim() !== "" : Array.isArray(a) ? a.length > 0 : true);

    const r = !!review[it.id];
    const v = !!visited[it.id];

    let bg = "#f1f5f9"; // not visited
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
    if (idx === current) {
      bd = "#111827";
    }

    return { idx, bg, bd, color };
  });

  return (
    <div style={styles.wrap}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.title}>GATE ECE Mock Platform</div>
        <div style={styles.headerRight}>
          <div style={styles.timer}>Time Left: {timeText}</div>
          <button style={styles.btn} onClick={onBack}>
            Exit
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={styles.grid}>
        {/* Left: Question */}
        <div style={styles.left}>
          <div style={styles.card}>
            <div style={styles.qTop}>
              <div>
                <div style={styles.qMeta}>
                  <span style={styles.badge}>{q.subject}</span>
                  {q.topic ? <span style={styles.badgeMuted}>{q.topic}</span> : null}
                  <span style={styles.badgeMuted}>
                    {q.type} • {q.marks} mark{q.marks === 1 ? "" : "s"}
                  </span>
                </div>
                <div style={styles.qNo}>
                  Question {current + 1} / {total}{" "}
                  {q.question_number ? `(Q${q.question_number})` : ""}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={styles.smallMuted}>
                  {isVisited ? "Visited" : "Not visited"} •{" "}
                  {isReviewed ? "Marked for review" : "Not in review"}
                </div>
                <div style={styles.smallMuted}>
                  {q.paper ? `${q.paper}` : ""} {q.year ? `• ${q.year}` : ""}{" "}
                  {q.session ? `• Session ${q.session}` : ""}
                </div>
              </div>
            </div>

            <div style={styles.qText}>{q.question}</div>

            {/* Answer Area */}
            <div style={{ marginTop: 14 }}>
              {q.type === "MCQ" && q.options ? (
                <div style={styles.optList}>
                  {Object.entries(q.options)
                    .filter(([k, v]) => ["A", "B", "C", "D", "E"].includes(k) && String(v ?? "").trim() !== "")
                    .map(([k, v]) => (
                      <label key={k} style={styles.optItem}>
                        <input
                          type="radio"
                          name={`mcq-${qid}`}
                          checked={ans === k}
                          onChange={() => selectMcq(k)}
                        />
                        <span style={styles.optKey}>{k}.</span>
                        <span>{String(v)}</span>
                      </label>
                    ))}
                </div>
              ) : null}

              {q.type === "MSQ" && q.options ? (
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

              {q.type === "NAT" ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={styles.smallMuted}>
                    Enter numeric answer (supports decimals). Leave blank if you want to skip.
                  </div>
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

            {/* Buttons */}
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

          {/* Submit */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <button
              style={styles.btnDanger}
              onClick={() => submitTest(false)}
              disabled={submitting}
              title="Submit your test"
            >
              {submitting ? "Submitting…" : "Submit Test"}
            </button>
          </div>
        </div>

        {/* Right: Palette */}
        <div style={styles.right}>
          <div style={styles.card}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Question Palette</div>

            <div style={styles.legend}>
              <span style={{ ...styles.legendItem, background: "#dcfce7", borderColor: "#86efac" }}>
                Answered
              </span>
              <span style={{ ...styles.legendItem, background: "#e8f0ff", borderColor: "#c7d2fe" }}>
                Visited
              </span>
              <span style={{ ...styles.legendItem, background: "#ffedd5", borderColor: "#fdba74" }}>
                Review
              </span>
              <span style={{ ...styles.legendItem, background: "#f1f5f9", borderColor: "#e2e8f0" }}>
                Not visited
              </span>
            </div>

            <div style={styles.palette}>
              {palette.map((p) => (
                <button
                  key={p.idx}
                  style={{
                    ...styles.pill,
                    background: p.bg,
                    borderColor: p.bd,
                    color: p.color,
                  }}
                  onClick={() => goto(p.idx)}
                >
                  {p.idx + 1}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 14, display: "grid", gap: 6 }}>
              <div style={styles.smallMuted}>
                Total: <b>{total}</b>
              </div>
              <div style={styles.smallMuted}>
                Answered:{" "}
                <b>
                  {questions.filter((it) => {
                    const a = answers[it.id];
                    if (a === undefined || a === null) return false;
                    if (typeof a === "string") return a.trim() !== "";
                    if (Array.isArray(a)) return a.length > 0;
                    return true;
                  }).length}
                </b>
              </div>
              <div style={styles.smallMuted}>
                Marked for review: <b>{questions.filter((it) => !!review[it.id]).length}</b>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <button style={styles.btn} onClick={() => goto(current - 1)} disabled={current <= 0}>
                Previous
              </button>{" "}
              <button style={styles.btn} onClick={() => goto(current + 1)} disabled={current >= total - 1}>
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------
   Simple inline styles
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
  title: { fontSize: 20, fontWeight: 900 },
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
  left: {},
  right: {},
  card: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
  },
  qTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  qMeta: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 },
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
  palette: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: 8,
    marginTop: 10,
  },
  pill: {
    padding: "10px 0",
    borderRadius: 12,
    border: "2px solid #e5e7eb",
    fontWeight: 900,
    cursor: "pointer",
  },
  legend: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 10,
  },
  legendItem: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid",
    fontSize: 12,
    fontWeight: 800,
  },
};
