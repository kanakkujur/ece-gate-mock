// FILE: ~/gate-frontend/src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api.js";
import { useAuthStore } from "./authStore.js";
import Login from "./Login.jsx";
import Dashboard from "./Dashboard.jsx";
import Exam from "./Exam.jsx";
import "./dashboard.css";

export default function App() {
  const token = useAuthStore((s) => s.token);
  const email = useAuthStore((s) => s.email);
  const clearSession = useAuthStore((s) => s.clearSession);

  // UI screens
  const [screen, setScreen] = useState("dashboard"); // "dashboard" | "exam"

  // data
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // exam state
  const [examQuestions, setExamQuestions] = useState([]);
  const [examMeta, setExamMeta] = useState({ mode: "main", subject: "EC" });

  const isAuthed = !!token;

  // Load history whenever token changes
  useEffect(() => {
    if (!token) {
      setHistory([]);
      return;
    }

    (async () => {
      setLoadingHistory(true);
      try {
        const data = await apiFetch("/test/history", { token });
        setHistory(Array.isArray(data) ? data : []);
      } catch (e) {
        setHistory([]);
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [token]);

  const topBar = useMemo(() => {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 18px",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          background: "white",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <b style={{ fontSize: 16 }}>GATE ECE Mock Platform</b>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {isAuthed && (
            <span style={{ opacity: 0.75, fontSize: 13 }}>
              {email || "—"}
            </span>
          )}

          {isAuthed ? (
            <button
              onClick={() => {
                clearSession();
                setScreen("dashboard");
              }}
              style={{
                padding: "7px 10px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.15)",
                background: "white",
                cursor: "pointer",
                fontWeight: 700,
              }}
              type="button"
            >
              Logout
            </button>
          ) : null}
        </div>
      </div>
    );
  }, [isAuthed, email, clearSession]);

  // Start MAIN: 65 questions, backend will do GA+EC split (your backend logic)
  async function onStartMain() {
    try {
      const data = await apiFetch(`/test/generate?count=65&subjects=EC`, {
        token,
      });

      setExamQuestions(data?.questions || []);
      setExamMeta({ mode: "main", subject: "EC" });
      setScreen("exam");
    } catch (e) {
      alert(e?.message || "Failed to start test");
    }
  }

  // Start SUBJECT-WISE: still 65 questions, but only from selected subject (you said logic differs)
  // NOTE: adjust query param mapping later if you decide to send a real subject code list.
  async function onStartSubject(subject) {
    try {
      const subj = subject || "EC";
      const data = await apiFetch(
        `/test/generate?count=65&subjects=${encodeURIComponent(subj)}`,
        { token }
      );

      setExamQuestions(data?.questions || []);
      setExamMeta({ mode: "subject", subject: subj });
      setScreen("exam");
    } catch (e) {
      alert(e?.message || "Failed to start test");
    }
  }

  async function onExamSubmit({ score, accuracy, answers, totalQuestions }) {
    // Exam.jsx can call this when user submits.
    try {
      await apiFetch("/test/submit", {
        token,
        method: "POST",
        body: { score, accuracy, answers, totalQuestions },
      });

      // refresh history
      const data = await apiFetch("/test/history", { token });
      setHistory(Array.isArray(data) ? data : []);

      setScreen("dashboard");
    } catch (e) {
      alert(e?.message || "Submit failed");
    }
  }

  if (!isAuthed) {
    return (
      <div style={{ minHeight: "100vh", background: "white" }}>
        {topBar}
        <Login />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "white" }}>
      {topBar}

      {screen === "dashboard" ? (
        <Dashboard
          history={loadingHistory ? [] : history}
          onStartMain={onStartMain}
          onStartSubject={onStartSubject}
        />
      ) : (
        <Exam
          token={token}
          questions={examQuestions}
          meta={examMeta}
          onBack={() => setScreen("dashboard")}
          onSubmit={onExamSubmit}
        />
      )}
    </div>
  );
}
