// gate-frontend/src/Intel.jsx
import React, { useEffect, useState } from "react";
import { apiFetch } from "./api";

export default function Intel({ token, onBack }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    try {
      const r = await apiFetch(`/intel/recommendations?days=${days}`, { token });
      setData(r);
    } catch (e) {
      setErr(e.message || "Failed to load intel");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: 1100, margin: "30px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Intelligence (Recommendations)</h2>
        <button onClick={onBack}>Back</button>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label><b>Window days:</b></label>
        <input type="number" value={days} min={1} max={365} onChange={(e) => setDays(Number(e.target.value || 30))} />
        <button onClick={load}>Refresh</button>
      </div>

      {err ? <div style={{ color: "crimson", marginTop: 12 }}>{err}</div> : null}

      <div style={{ marginTop: 14, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
        <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
          {data ? JSON.stringify(data, null, 2) : "Loading…"}
        </pre>
      </div>
    </div>
  );
}
