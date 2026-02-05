// aiProviders/local.js
export async function generateWithLocal(prompt) {
  const base = process.env.LOCAL_LLM_URL || "http://127.0.0.1:11434";
  const model = process.env.LOCAL_LLM_MODEL || "llama3.1";

  const r = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
  });

  if (!r.ok) throw new Error(`Local LLM failed (${r.status})`);
  const data = await r.json();
  return data.response;
}

// gate-backend/aiProviders/local.js
export async function generateQuestions({ subject, topic, count = 5 }) {
  // Keep structure compatible with OpenAI schema
  // (Later, you can call Ollama here)
  throw new Error("Local provider not enabled/configured yet.");
}
