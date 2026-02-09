// FILE: ~/gate-frontend/src/api.js
import { useAuthStore } from "./authStore.js";

const API = import.meta.env.VITE_API_BASE || "/api";

/**
 * apiFetch
 * - Uses Authorization: Bearer <token> automatically (unless token explicitly provided)
 * - Never crashes on invalid JSON (returns { raw: "..." })
 * - On 401, clears auth session (so UI returns to Login)
 */
export async function apiFetch(path, { token, method = "GET", body } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";

  const finalToken = token ?? useAuthStore.getState().token;
  if (finalToken) headers["Authorization"] = `Bearer ${finalToken}`;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (res.status === 401) {
    useAuthStore.getState().clearSession();
  }

  if (!res.ok) {
    // Prefer backend error field, otherwise show raw
    const msg =
      data?.error ||
      (data?.raw ? String(data.raw).slice(0, 400) : null) ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }

  // If backend returned 200 but body isn't JSON, surface it clearly
  if (data && typeof data === "object" && "raw" in data) {
    throw new Error(
      `Backend returned invalid JSON for ${path}. Raw:\n` +
        String(data.raw).slice(0, 400)
    );
  }

  return data;
}
