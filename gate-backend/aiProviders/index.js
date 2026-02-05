// aiProviders/index.js
import { generateWithOpenAI } from "./openai.js";
import { generateWithLocal } from "./local.js";

export async function generateText(prompt) {
  const mode = process.env.AI_PROVIDER || "auto";

  if (mode === "openai") return generateWithOpenAI(prompt);
  if (mode === "local") return generateWithLocal(prompt);

  // auto: try OpenAI first, fallback to local
  try {
    return await generateWithOpenAI(prompt);
  } catch (e) {
    console.error("OpenAI failed, falling back to local:", e.message);
    return generateWithLocal(prompt);
  }
}
