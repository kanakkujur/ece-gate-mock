import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api.js";
import { useAuthStore } from "./authStore.js";
import Login from "./Login.jsx";
import Dashboard from "./Dashboard.jsx";
import Exam from "./Exam.jsx";
import Review from "./Review.jsx";
import "./dashboard.css";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function App() {
  const token = useAuthStore((s) => s.token);
  const email = useAuthStore((s) => s.email);
  const clearSession = useAuthStore((s) => s.clearSession);

  const isAuthed = !!token;

  // UI screens
  const [screen, setScreen] = useState("dashboard"); // "dashboard" | "exam" | "review"

  // dashboard data
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // blueprint
  const [blueprint, setBlueprint] = useState(null);

  // exam state
  const [examQuestions, setExamQuestions] = useState([]);
  const [examMeta, setExamMeta] = useState({
    mode: "main",
    subject: "EC",
    difficulty: "medium",
    testId: null,
    blueprint: null,
  });

  // Stage-9: start-main progress polling state
  const [mainDifficulty, setMainDifficulty] = useState("medium"); // easy|medium|hard
  const [startingMain, setStartingMain] = useState(false);
  const [startProgress, setStartProgress] = useState(null); // status payload from backend

  // Stage-6B (AI Subject Generate)
  const [aiGen, setAiGen] = useState(null);
  const [aiGenLoading, setAiGenLoading] = useState(false);
  const [aiImportLoading, setAiImportLoading] = useState(false);

  // Stage-10: review screen state
  const [reviewTestId, setReviewTestId] = useState(null);

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

  async function refreshHistory() {
    if (!token) return;
    try {
      const data = await apiFetch("/test/history", { token });
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
  }

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
                  setReviewTestId(null);
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
  // Stage-9: Start MAIN via jobId polling
  // POST /api/test/start-main { difficulty } -> { jobId }
  // Poll GET /api/test/start-main/status?jobId=... until done/error
  // =========================
  async function onStartMain() {
    if (!token) return;

    setStartingMain(true);
    setStartProgress({
      status: "starting",
      step: "Starting…",
      percent: 0,
    });

    try {
      const start = await apiFetch("/test/start-main", {
        token,
        method: "POST",
        body: { difficulty: mainDifficulty },
      });

      const jobId = start?.jobId;
      if (!jobId) {
        throw new Error("Backend did not return jobId for start-main");
      }

      // Poll status
      while (true) {
        const s = await apiFetch(`/test/start-main/status?jobId=${encodeURIComponent(jobId)}`, { token });

        setStartProgress(s);

        if (s?.status === "done") {
          const result = s?.result;
          const qs = result?.questions || [];
          if (!Array.isArray(qs) || qs.length === 0) {
            throw new Error("No questions returned in start-main result");
          }

          setExamQuestions(qs);
          setExamMeta({
            mode: "main",
            subject: "EC",
            difficulty: mainDifficulty,
            testId: result?.testId ?? null,
            blueprint: result?.blueprint ?? null,
          });

          setScreen("exam");
          break;
        }

        if (s?.status === "error") {
          throw new Error(s?.error || "start-main failed");
        }

        await sleep(800);
      }
    } catch (e) {
      alert(e?.message || "Failed to start main test");
    } finally {
      setStartingMain(false);
      setStartProgress(null);
    }
  }

  // Subject-wise start (existing DB bank path)
  async function onStartSubject(subject) {
    try {
      const subj = subject || "EC";
      const data = await apiFetch(`/test/generate?count=65&subjects=${encodeURIComponent(subj)}`, { token });
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

  // Exam Submit -> backend evaluator persists -> refresh history -> return to dashboard
  async function onExamSubmit({ answers, totalQuestions }) {
    try {
      await apiFetch("/test/submit", {
        token,
        method: "POST",
        body: {
          answers,
          totalQuestions,
          mode: examMeta?.mode || "main",
          subject: examMeta?.subject || null,
          remainingTime: 0,
          testId: examMeta?.testId ?? null,
        },
      });

      await refreshHistory();
      setScreen("dashboard");
    } catch (e) {
      alert(e?.message || "Submit failed");
    }
  }

  // =========================
  // Stage-6B: AI Subject Generate + Import
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
        difficulty,
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

  // Stage-10: open review screen for a testId
  async function onOpenReview(testId) {
    setReviewTestId(testId);
    setScreen("review");
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
          // Stage-9 start-main (job polling lives in App)
          onStartMain={onStartMain}
          mainDifficulty={mainDifficulty}
          setMainDifficulty={setMainDifficulty}
          startingMain={startingMain}
          startProgress={startProgress}
          // subject start
          onStartSubject={onStartSubject}
          // AI subject gen section (optional)
          aiGen={aiGen}
          aiGenLoading={aiGenLoading}
          aiImportLoading={aiImportLoading}
          onAIGenerateSubject={onAIGenerateSubject}
          onAIImportGenerated={onAIImportGenerated}
          // Stage-10 review action
          onOpenReview={onOpenReview}
          // Stage-10 fetch helpers
          token={token}
        />
      ) : screen === "exam" ? (
        <Exam
          token={token}
          questions={examQuestions}
          meta={examMeta}
          onBack={() => setScreen("dashboard")}
          onSubmit={onExamSubmit}
        />
      ) : (
        <Review
          token={token}
          testId={reviewTestId}
          onBack={() => {
            setScreen("dashboard");
            setReviewTestId(null);
          }}
        />
      )}
    </div>
  );
}
