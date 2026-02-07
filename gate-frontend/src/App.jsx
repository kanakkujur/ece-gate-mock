// FILE: ~/gate-frontend/src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api.js";
import { useAuthStore } from "./authStore.js";
import Login from "./Login.jsx";
import Dashboard from "./Dashboard.jsx";
import Exam from "./Exam.jsx";
import "./dashboard.css";

export default function App() {
  const [blueprint, setBlueprint] = useState(null);

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
  const [examMeta, setExamMeta] = useState({
    mode: "main",
    subject: "EC",
    difficulty: "medium",
    testId: null,
    blueprint: null,
  });

  // =========================
  // STAGE-6C (Main start with difficulty)
  // =========================
  const [mainDifficulty, setMainDifficulty] = useState("medium"); // easy|medium|hard
  const [startingMain, setStartingMain] = useState(false);

  // STAGE-6B (AI Subject Generate)
  const [aiGen, setAiGen] = useState(null);
  const [aiGenLoading, setAiGenLoading] = useState(false);
  const [aiImportLoading, setAiImportLoading] = useState(false);

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
      } catch {
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
          {isAuthed && <span style={{ opacity: 0.75, fontSize: 13 }}>{email || "—"}</span>}

          {isAuthed ? (
            <>
              <button
                onClick={async () => {
                  try {
                    // toggle OFF
                    if (blueprint !== null) {
                      setBlueprint(null);
                      return;
                    }
                    // toggle ON (fetch)
                    const data = await apiFetch("/ai/blueprint?mode=main", { token });
                    setBlueprint(data);
                  } catch (e) {
                    alert(e?.message || "Failed to load blueprint");
                  }
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
                {blueprint ? "Hide Blueprint" : "Blueprint"}
              </button>

              <button
                onClick={() => {
                  clearSession();
                  setBlueprint(null);
                  setScreen("dashboard");
                  setAiGen(null);
                  setExamQuestions([]);
                  setExamMeta({
                    mode: "main",
                    subject: "EC",
                    difficulty: "medium",
                    testId: null,
                    blueprint: null,
                  });
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
            </>
          ) : null}
        </div>
      </div>
    );
  }, [isAuthed, email, clearSession, token, blueprint]);

  // =========================
  // STAGE-6C: Start MAIN via backend orchestration
  // POST /api/test/start-main { difficulty }
  // Expected response: { testId, questions, blueprint }
  // =========================
  async function onStartMain() {
    if (!token) return;

    setStartingMain(true);
    try {
      // Stage-6C path
      const data = await apiFetch("/test/start-main", {
        token,
        method: "POST",
        body: { difficulty: mainDifficulty },
      });

      const qs = data?.questions || [];
      if (!Array.isArray(qs) || qs.length === 0) {
        // Fallback to old behavior if backend not fully implemented yet
        const fallback = await apiFetch(`/test/generate?count=65&subjects=EC`, { token });
        const fqs = fallback?.questions || [];
        if (!fqs.length) throw new Error("No questions returned");
        setExamQuestions(fqs);
        setExamMeta({
          mode: "main",
          subject: "EC",
          difficulty: mainDifficulty,
          testId: null,
          blueprint: null,
        });
        setScreen("exam");
        return;
      }

      setExamQuestions(qs);
      setExamMeta({
        mode: "main",
        subject: "EC",
        difficulty: mainDifficulty,
        testId: data?.testId ?? null,
        blueprint: data?.blueprint ?? null,
      });
      setScreen("exam");
    } catch (e) {
      alert(e?.message || "Failed to start main test");
    } finally {
      setStartingMain(false);
    }
  }

  // Start SUBJECT-WISE: (existing DB bank path)
  async function onStartSubject(subject) {
    try {
      const subj = subject || "EC";
      const data = await apiFetch(`/test/generate?count=65&subjects=${encodeURIComponent(subj)}`, {
        token,
      });
      const qs = data?.questions || [];
      if (!qs.length) throw new Error("No questions returned");

      setExamQuestions(qs);
      setExamMeta({
        mode: "subject",
        subject: subj,
        difficulty: null,
        testId: null,
        blueprint: null,
      });
      setScreen("exam");
    } catch (e) {
      alert(e?.message || "Failed to start test");
    }
  }

  async function onExamSubmit({ score, accuracy, answers, totalQuestions }) {
    try {
      await apiFetch("/test/submit", {
        token,
        method: "POST",
        body: {
          score,
          accuracy,
          answers,
          totalQuestions,
          mode: examMeta?.mode || "main",
          subject: examMeta?.subject || null,
          // testId is not used by your current /test/submit handler,
          // but sending it is harmless and future-proof if you add support later.
          testId: examMeta?.testId ?? null,
        },
      });

      // refresh history
      const data = await apiFetch("/test/history", { token });
      setHistory(Array.isArray(data) ? data : []);

      setScreen("dashboard");
    } catch (e) {
      alert(e?.message || "Submit failed");
    }
  }

  // =========================
  // STAGE-6B: AI Subject Generate + Import
  // =========================
  async function onAIGenerateSubject({ subject, topic, count, difficulty }) {
    if (!token) throw new Error("Missing token");
    setAiGenLoading(true);
    try {
      const payload = {
        provider: "openai",
        mode: "subject",
        subject,
        topic,
        count,
        difficulty, // Stage-6B
      };

      const data = await apiFetch("/ai/generate", {
        token,
        method: "POST",
        body: payload,
      });

      setAiGen(data);
      return data;
    } finally {
      setAiGenLoading(false);
    }
  }

  async function onAIImportGenerated() {
    if (!token) throw new Error("Missing token");
    const qs = aiGen?.questions;
    if (!Array.isArray(qs) || qs.length === 0) {
      throw new Error("No generated questions to import");
    }

    setAiImportLoading(true);
    try {
      const out = await apiFetch("/questions/import", {
        token,
        method: "POST",
        body: { questions: qs },
      });

      alert(`Imported ✅ inserted=${out?.inserted ?? "?"}`);
      return out;
    } finally {
      setAiImportLoading(false);
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

      {screen === "dashboard" && blueprint && (
        <pre
          style={{
            margin: "12px 18px 0",
            padding: 12,
            background: "#f6f7f8",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.08)",
            overflow: "auto",
            maxHeight: 260,
            fontSize: 12,
          }}
        >
          {JSON.stringify(blueprint, null, 2)}
        </pre>
      )}

      {screen === "dashboard" ? (
        <Dashboard
          history={loadingHistory ? [] : history}
          // Stage-6C props for Main start UI:
          onStartMain={onStartMain}
          mainDifficulty={mainDifficulty}
          setMainDifficulty={setMainDifficulty}
          startingMain={startingMain}
          // Subject wise start:
          onStartSubject={onStartSubject}
          // Stage-6B props:
          aiGen={aiGen}
          aiGenLoading={aiGenLoading}
          aiImportLoading={aiImportLoading}
          onAIGenerateSubject={onAIGenerateSubject}
          onAIImportGenerated={onAIImportGenerated}
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
