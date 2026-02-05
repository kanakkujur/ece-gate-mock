// FILE: ~/gate-frontend/src/Login.jsx
import React, { useMemo, useState } from "react";
import { apiFetch } from "./api.js";
import { useAuthStore } from "./authStore.js";

export default function Login() {
  const setSession = useAuthStore((s) => s.setSession);

  const existingEmail = useAuthStore((s) => s.email);
  const [email, setEmail] = useState(existingEmail || "");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login"); // login | signup
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const title = useMemo(() => (mode === "login" ? "Login" : "Create account"), [mode]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);

    try {
      const path = mode === "login" ? "/auth/login" : "/auth/signup";
      const data = await apiFetch(path, {
        method: "POST",
        body: { email, password },
      });

      if (!data?.token) throw new Error("Auth failed");
      setSession({ token: data.token, email, user: data.user || null });
      setPassword("");
    } catch (e2) {
      setErr(e2?.message || "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "white" }}>
      <div style={{ maxWidth: 440, margin: "40px auto", padding: "0 16px" }}>
        <h2 style={{ margin: "0 0 10px" }}>{title}</h2>
        <p style={{ margin: "0 0 16px", opacity: 0.7, fontSize: 13 }}>
          {mode === "login"
            ? "Use your email + password to continue."
            : "Sign up with an email + password. You can login right after."}
        </p>

        <form
          onSubmit={onSubmit}
          style={{
            border: "1px solid rgba(0,0,0,0.10)",
            borderRadius: 14,
            padding: 16,
            display: "grid",
            gap: 10,
            background: "white",
          }}
        >
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.75 }}>Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.15)",
              }}
              autoComplete="email"
              inputMode="email"
              required
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.75 }}>Password</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.15)",
              }}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </label>

          {err ? (
            <div
              style={{
                border: "1px solid rgba(255,0,0,0.25)",
                background: "rgba(255,0,0,0.06)",
                padding: 10,
                borderRadius: 10,
                fontSize: 13,
              }}
            >
              {err}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            style={{
              border: 0,
              background: "rgba(0,0,0,0.85)",
              color: "white",
              padding: "10px 14px",
              borderRadius: 12,
              fontWeight: 800,
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "Please wait…" : mode === "login" ? "Login" : "Sign up"}
          </button>

          <button
            type="button"
            onClick={() => {
              setErr("");
              setMode((m) => (m === "login" ? "signup" : "login"));
            }}
            style={{
              border: "1px solid rgba(0,0,0,0.15)",
              background: "white",
              padding: "10px 14px",
              borderRadius: 12,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {mode === "login" ? "Create account" : "Back to login"}
          </button>
        </form>
      </div>
    </div>
  );
}
