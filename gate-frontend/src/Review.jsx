// gate-frontend/src/Review.jsx
import React, { useEffect, useState } from "react";
import { apiFetch } from "./api";

export default function Review({ token, testId, onBack }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setErr("");
      try {
        const r = await apiFetch(`/test/${encodeURIComponent(testId)}/review`, { token });
        if (!alive) return;
        setData(r);
      } catch (e) {
        if (!alive) return;
        setErr(e.message || "Failed to load review");
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, testId]);

  if (!testId) {
    return (
      <div style={{ fontFamily: "system-ui", maxWidth: 1000, margin: "30px auto", padding: 16 }}>
        <h2>Review</h2>
        <div>No testId.</div>
        <button onClick={onBack}>Back</button>
      </div>
    );
  }

  if (err) {
    return (
      <div style={{ fontFamily: "system-ui", maxWidth: 1000, margin: "30px auto", padding: 16 }}>
        <h2>Review (testId={testId})</h2>
        <div style={{ color: "crimson" }}>{err}</div>
        <button onClick={onBack}>Back</button>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ fontFamily: "system-ui", maxWidth: 1000, margin: "30px auto", padding: 16 }}>
        <h2>Review (testId={testId})</h2>
        <div>Loading…</div>
      </div>
    );
  }

  const questions = data.questions || [];
  const answers = data.answers || {};
  const maxScore = data.max_score ?? data.maxScore;

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: 1100, margin: "30px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Review</h2>
          <div style={{ opacity: 0.8 }}>
            testId={data.id} · score={data.score ?? "—"} · accuracy={data.accuracy ?? "—"} · maxScore={maxScore ?? "—"}
          </div>
        </div>
        <button onClick={onBack}>Back</button>
      </div>

      <div style={{ marginTop: 14, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
        <div><b>Submitted:</b> {String(!!data.is_submitted)}</div>
        <div><b>Created:</b> {data.created_at}</div>
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {questions.map((q, i) => {
          const qid = String(q.id);
          const given = answers?.[qid] || null;

          return (
            <div key={qid} style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div><b>Q{i + 1}</b> · {q.subject} · {q.topic} · {q.type}</div>
                <div>
                  <b>Marks:</b> {q.marks} · <b>Neg:</b> {q.neg_marks}
                </div>
              </div>

              <div style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
                {q.question}
              </div>

              {q.type !== "NAT" && q.options ? (
                <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                  {["A", "B", "C", "D"].map((k) => {
                    const txt = q.options?.[k];
                    if (!txt) return null;
                    return (
                      <div key={k}>
                        <b>{k}.</b> {txt}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div style={{ marginTop: 10 }}>
                <div><b>Correct:</b> {String(q.answer ?? "")}</div>
                <div><b>Given:</b> {given ? JSON.stringify(given) : "— (skipped)"}</div>
              </div>

              {q.solution ? (
                <div style={{ marginTop: 10, padding: 10, background: "#fafafa", borderRadius: 8, whiteSpace: "pre-wrap" }}>
                  <b>Explanation:</b> {q.solution}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
