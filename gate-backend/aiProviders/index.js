import { generateWithLocal } from "./local.js";

export async function generateText(prompt) {
  const mode = (process.env.AI_PROVIDER || "local").toLowerCase();
  if (mode === "local" || mode === "auto") return generateWithLocal(prompt);
  throw new Error("Text generation supports local or auto. Use generateQuestions for OpenAI.");
}
