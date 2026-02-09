import { useAuthStore } from "./authStore.js";

const API = import.meta.env.VITE_API_BASE || "/api";

/**
 * apiFetch
 * - Uses Authorization: Bearer <token> automatically (unless token explicitly provided)
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

  // Try JSON; if not JSON, keep raw text (helps debug HTML/error pages)
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
    const msg =
      data?.error ||
      data?.detail ||
      (typeof data?.raw === "string" && data.raw.trim()
        ? data.raw.slice(0, 250)
        : `Request failed (${res.status})`);
    throw new Error(msg);
  }

  return data;
}
