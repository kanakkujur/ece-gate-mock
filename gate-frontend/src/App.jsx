// FILE: ~/gate-frontend/src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api.js";
import { useAuthStore } from "./authStore.js";
import Login from "./Login.jsx";
import Dashboard from "./Dashboard.jsx";
import Exam from "./Exam.jsx";
import DesignReview from "./DesignReview.jsx";
import "./dashboard.css";

/** Simple ErrorBoundary to avoid “white screen” */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("UI ErrorBoundary:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 18, fontFamily: "system-ui" }}>
          <h2 style={{ margin: 0 }}>UI crashed</h2>
          <p style={{ opacity: 0.8 }}>
            This is a frontend render error (not backend). Check the console and fix the data shape.
          </p>
          <pre
            style={{
              background: "#f8fafc",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 12,
              overflow: "auto",
              maxHeight: 260,
            }}
          >
            {String(this.state.error?.message || this.state.error || "Unknown error")}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.2)",
              background: "white",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function normalizeHistoryResponse(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.history)) return data.history;
  if (data && Array.isArray(data.sessions)) return data.sessions;
  return [];
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Supports BOTH backend shapes:
 * A) start-main returns { jobId } and we poll /start-main/status?jobId=...
 * B) start-main returns { testId, questions, blueprint } immediately
 */
async function startMainAndFetchQuestions({ token, difficulty }) {
  const start = await apiFetch("/test/start-main", {
    token,
    method: "POST",
    body: { difficulty },
  });

  // If immediate questions exist, just return them
  if (start && Array.isArray(start.questions) && start.questions.length) {
    return {
      testId: start.testId ?? null,
      questions: start.questions,
      blueprint: start.blueprint ?? null,
      jobId: null,
    };
  }

  // If async job
  const jobId = start?.jobId;
  if (!jobId) {
    // unknown response shape
    return { testId: null, questions: [], blueprint: null, jobId: null };
  }

  // Poll status
  for (let i = 0; i < 240; i++) {
    const s = await apiFetch(`/test/start-main/status?jobId=${encodeURIComponent(jobId)}`, {
      token,
      method: "GET",
    });

    if (s?.status === "done") {
      const result = s?.result || {};
      return {
        testId: result.testId ?? null,
        questions: Array.isArray(result.questions) ? result.questions : [],
        blueprint: result.blueprint ?? null,
        jobId,
      };
    }
    if (s?.status === "error") {
      throw new Error(s?.error || "start-main failed");
    }
    await sleep(800);
  }

  throw new Error("start-main timed out (polling exceeded)");
}

export default function App() {
  const [blueprint, setBlueprint] = useState(null);

  const token = useAuthStore((s) => s.token);
  const email = useAuthStore((s) => s.email);
  const clearSession = useAuthStore((s) => s.clearSession);

  // UI screens
  const [screen, setScreen] = useState("dashboard"); // "dashboard" | "exam" | "review"

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

  // review state
  const [reviewTestId, setReviewTestId] = useState(null);

  // Main start
  const [mainDifficulty, setMainDifficulty] = useState("medium");
  const [startingMain, setStartingMain] = useState(false);

  // AI Subject Generate
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
        setHistory(normalizeHistoryResponse(data));
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
                    if (blueprint !== null) {
                      setBlueprint(null);
                      return;
                    }
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

  // Start MAIN (supports jobId polling)
  async function onStartMain() {
    if (!token) return;

    setStartingMain(true);
    try {
      const out = await startMainAndFetchQuestions({
        token,
        difficulty: mainDifficulty,
      });

      const qs = out?.questions || [];
      if (!Array.isArray(qs) || qs.length === 0) {
        // fallback
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
        testId: out?.testId ?? null,
        blueprint: out?.blueprint ?? null,
      });
      setScreen("exam");
    } catch (e) {
      alert(e?.message || "Failed to start main test");
    } finally {
      setStartingMain(false);
    }
  }

  // Start SUBJECT-WISE
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

  async function refreshHistory() {
    if (!token) return;
    const data = await apiFetch("/test/history", { token });
    setHistory(normalizeHistoryResponse(data));
  }

  async function onExamSubmit({ remainingTime, answers, totalQuestions, mode, subject }) {
    try {
      const resp = await apiFetch("/test/submit", {
        token,
        method: "POST",
        body: {
          mode: mode || examMeta?.mode || "main",
          subject: subject || examMeta?.subject || null,
          remainingTime: remainingTime ?? 0,
          totalQuestions: totalQuestions,
          answers,
          testId: examMeta?.testId ?? null,
        },
      });

      await refreshHistory();

      // Go directly to review of this test
      const tid = resp?.testId ?? examMeta?.testId ?? null;
      if (tid) {
        setReviewTestId(tid);
        setScreen("review");
      } else {
        setScreen("dashboard");
      }
    } catch (e) {
      alert(e?.message || "Submit failed");
    }
  }

  function onOpenReview(testId) {
    setReviewTestId(testId);
    setScreen("review");
  }

  // AI Subject Generate + Import
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

  if (!isAuthed) {
    return (
      <div style={{ minHeight: "100vh", background: "white" }}>
        {topBar}
        <Login />
      </div>
    );
  }

  return (
    <ErrorBoundary>
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
            onStartMain={onStartMain}
            mainDifficulty={mainDifficulty}
            setMainDifficulty={setMainDifficulty}
            startingMain={startingMain}
            onStartSubject={onStartSubject}
            onOpenReview={onOpenReview}
            aiGen={aiGen}
            aiGenLoading={aiGenLoading}
            aiImportLoading={aiImportLoading}
            onAIGenerateSubject={onAIGenerateSubject}
            onAIImportGenerated={onAIImportGenerated}
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
          <DesignReview
            token={token}
            testId={reviewTestId}
            onBack={() => setScreen("dashboard")}
            onOpenExamAgain={() => setScreen("dashboard")}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
