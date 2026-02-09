// FILE: ~/gate-frontend/src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api.js";
import { useAuthStore } from "./authStore.js";
import Login from "./Login.jsx";
import Dashboard from "./Dashboard.jsx";
import Exam from "./Exam.jsx";
import "./dashboard.css";

/**
 * Stage-8: Frontend wiring to backend job-based main-start
 * - POST /api/test/start-main { difficulty } -> { jobId }
 * - Poll GET /api/test/start-main/status?jobId=... -> progress + when done includes result.testId + result.questions
 */

function ProgressOverlay({ title, subtitle, percent, leftText, rightText, statusLine }) {
  const p = Math.max(0, Math.min(100, Number(percent || 0)));
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.35)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        style={{
          width: "min(720px, 92vw)",
          background: "white",
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 16,
          boxShadow: "0 20px 50px rgba(15, 23, 42, 0.18)",
          padding: 18,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 12 }}>{subtitle}</div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
          <span>{leftText || ""}</span>
          <span>{rightText || ""}</span>
        </div>

        <div
          style={{
            height: 10,
            borderRadius: 999,
            overflow: "hidden",
            background: "rgba(0,0,0,0.06)",
            border: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${p}%`,
              borderRadius: 999,
              background: "rgba(17,24,39,0.75)",
              transition: "width 250ms ease",
            }}
          />
        </div>

        {statusLine ? (
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
            <b>Status:</b> {statusLine}
          </div>
        ) : null}

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
          First run may take time if AI needs to generate and insert new questions into DB.
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [blueprint, setBlueprint] = useState(null);

  const token = useAuthStore((s) => s.token);
  const email = useAuthStore((s) => s.email);
  const clearSession = useAuthStore((s) => s.clearSession);

  const [screen, setScreen] = useState("dashboard"); // "dashboard" | "exam"
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [examQuestions, setExamQuestions] = useState([]);
  const [examMeta, setExamMeta] = useState({
    mode: "main",
    subject: "EC",
    difficulty: "medium",
    testId: null,
    blueprint: null,
  });

  // Main start
  const [mainDifficulty, setMainDifficulty] = useState("medium");
  const [startingMain, setStartingMain] = useState(false);

  // Progress overlay state
  const [progress, setProgress] = useState(null); // { percent, step, status, genInserted, genTarget, bucketsDone, bucketsTotal }

  // AI Subject Generate
  const [aiGen, setAiGen] = useState(null);
  const [aiGenLoading, setAiGenLoading] = useState(false);
  const [aiImportLoading, setAiImportLoading] = useState(false);

  const isAuthed = !!token;

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

  // Stage-8 main start with job polling
  async function onStartMain({ difficulty } = {}) {
    if (!token) return;

    const diff = String(difficulty || mainDifficulty || "medium").toLowerCase();

    setStartingMain(true);
    setProgress({
      percent: 0,
      step: "Starting",
      status: "starting",
      generatedInserted: 0,
      generatedTarget: 0,
      generatedBucketsDone: 0,
      generatedBucketsTotal: 12,
    });

    try {
      const start = await apiFetch("/test/start-main", {
        token,
        method: "POST",
        body: { difficulty: diff },
      });

      const jobId = start?.jobId;
      if (!jobId) throw new Error("Backend did not return jobId");

      // Poll
      while (true) {
        const s = await apiFetch(`/test/start-main/status?jobId=${encodeURIComponent(jobId)}`, { token });

        setProgress(s);

        if (s?.status === "done") {
          const testId = s?.result?.testId ?? null;
          const qs = s?.result?.questions || [];
          if (!Array.isArray(qs) || qs.length === 0) throw new Error("No questions returned from backend");

          setExamQuestions(qs);
          setExamMeta({
            mode: "main",
            subject: "EC",
            difficulty: diff,
            testId,
            blueprint: s?.result?.blueprint ?? null,
          });
          setScreen("exam");
          break;
        }

        if (s?.status === "error") {
          throw new Error(s?.error || "Backend job failed");
        }

        await new Promise((r) => setTimeout(r, 800));
      }
    } finally {
      setStartingMain(false);
      setProgress(null);
    }
  }

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

  async function onExamSubmit({ answers, totalQuestions, remainingTime }) {
    try {
      await apiFetch("/test/submit", {
        token,
        method: "POST",
        body: {
          answers,
          totalQuestions,
          remainingTime,
          mode: examMeta?.mode || "main",
          subject: examMeta?.subject || null,
          testId: examMeta?.testId ?? null,
        },
      });

      const data = await apiFetch("/test/history", { token });
      setHistory(Array.isArray(data) ? data : []);

      setScreen("dashboard");
    } catch (e) {
      alert(e?.message || "Submit failed");
    }
  }

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
    if (!Array.isArray(qs) || qs.length === 0) throw new Error("No generated questions to import");

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

      {progress ? (
        <ProgressOverlay
          title="Preparing Main Mock (65)…"
          subtitle={`Difficulty: ${String(examMeta?.difficulty || mainDifficulty)} • Please wait`}
          percent={progress?.percent ?? 0}
          leftText={`${Math.round(progress?.percent ?? 0)}%`}
          rightText={`${progress?.generatedInserted ?? 0}/${progress?.generatedTarget ?? 0} generated • ${progress?.generatedBucketsDone ?? 0}/${progress?.generatedBucketsTotal ?? 0} buckets`}
          statusLine={progress?.step ? `${progress.step}${progress?.status ? ` (${progress.status})` : ""}` : ""}
        />
      ) : null}

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
          onStartSubject={onStartSubject}
          aiGen={aiGen}
          aiGenLoading={aiGenLoading}
          aiImportLoading={aiImportLoading}
          onAIGenerateSubject={onAIGenerateSubject}
          onAIImportGenerated={onAIImportGenerated}
          showAIGeneratorDefault={false}
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
