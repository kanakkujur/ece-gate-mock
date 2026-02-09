// gate-frontend/src/Analytics.jsx
import React, { useEffect, useState } from "react";
import { apiFetch } from "./api";

export default function Analytics({ token, onBack }) {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState(null);
  const [weakness, setWeakness] = useState(null);
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    try {
      const o = await apiFetch(`/analytics/overview?days=${days}`, { token });
      const w = await apiFetch(`/analytics/weakness?days=${days}`, { token });
      setOverview(o);
      setWeakness(w);
    } catch (e) {
      setErr(e.message || "Failed to load analytics");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: 1100, margin: "30px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Analytics</h2>
        <button onClick={onBack}>Back</button>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label><b>Window days:</b></label>
        <input type="number" value={days} min={1} max={365} onChange={(e) => setDays(Number(e.target.value || 30))} />
        <button onClick={load}>Refresh</button>
      </div>

      {err ? <div style={{ color: "crimson", marginTop: 12 }}>{err}</div> : null}

      <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          <h3 style={{ marginTop: 0 }}>Overview</h3>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
            {overview ? JSON.stringify(overview, null, 2) : "Loading…"}
          </pre>
        </div>

        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          <h3 style={{ marginTop: 0 }}>Weakness</h3>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
            {weakness ? JSON.stringify(weakness, null, 2) : "Loading…"}
          </pre>
        </div>
      </div>
    </div>
  );
}
