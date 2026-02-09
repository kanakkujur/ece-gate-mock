import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api.js";

function normalize(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.slice().sort().join(",");
  return String(v).trim();
}

function isAttempted(a) {
  if (a == null) return false;
  if (Array.isArray(a)) return a.length > 0;
  if (typeof a === "string") return a.trim() !== "";
  return true;
}

export default function Review({ token, testId, onBack }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!token || !testId) return;

    (async () => {
      setLoading(true);
      try {
        const out = await apiFetch(`/test/${testId}/review`, { token });
        setData(out);
      } catch (e) {
        alert(e?.message || "Failed to load review");
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, testId]);

  const rows = useMemo(() => {
    const qs = data?.questions;
    const ansMap = data?.answers || {};
    if (!Array.isArray(qs) || !qs.length) return [];

    return qs.map((q, idx) => {
      const qid = q.id;
      const given = ansMap?.[String(qid)] ?? ansMap?.[qid] ?? null;
      const correct = q.answer ?? null;

      const attempted = isAttempted(given);
      const ok = attempted && normalize(given) === normalize(correct);

      return {
        idx,
        q,
        attempted,
        ok,
        given,
        correct,
      };
    });
  }, [data]);

  return (
    <div style={{ padding: 18, fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial' }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Review • Test #{testId}</div>
        <button
          onClick={onBack}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "white", fontWeight: 800 }}
        >
          Back
        </button>
      </div>

      {loading ? (
        <div style={cardStyle}>Loading…</div>
      ) : !data ? (
        <div style={cardStyle}>No data</div>
      ) : (
        <>
          <div style={cardStyle}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Pill>score: {data.score ?? "—"}</Pill>
              <Pill>accuracy: {data.accuracy ?? "—"}</Pill>
              <Pill>maxScore: {data.max_score ?? data.maxScore ?? "—"}</Pill>
              <Pill>mode: {data.mode ?? "—"}</Pill>
              <Pill>subject: {data.subject ?? "—"}</Pill>
              <Pill>submitted: {String(data.is_submitted)}</Pill>
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {rows.map((r) => (
              <div key={r.q.id} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 900 }}>
                    Q{r.idx + 1} • {r.q.section || "—"} • {r.q.subject || "—"} • {r.q.type || "—"}
                  </div>
                  <div style={{ fontWeight: 900 }}>
                    {r.attempted ? (r.ok ? "✅ Correct" : "❌ Wrong") : "⏭️ Skipped"}
                  </div>
                </div>

                <div style={{ marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{r.q.question}</div>

                <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 13 }}>
                  <div>
                    <b>Your answer:</b> {r.attempted ? <code>{normalize(r.given)}</code> : <span style={{ opacity: 0.7 }}>—</span>}
                  </div>
                  <div>
                    <b>Correct:</b> {r.correct != null ? <code>{normalize(r.correct)}</code> : <span style={{ opacity: 0.7 }}>—</span>}
                  </div>
                  {r.q.solution ? (
                    <div style={{ opacity: 0.9, marginTop: 6 }}>
                      <b>Solution:</b>
                      <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{r.q.solution}</div>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
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

const cardStyle = {
  background: "white",
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 16,
  padding: 14,
  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
};
