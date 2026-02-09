/**
 * Server-authoritative timer helper for Stage-11.
 *
 * We treat test_sessions fields as:
 * - duration_sec: total duration in seconds (default 3600)
 * - timer_started_at: when timer started/resumed last time
 * - timer_paused_at: when paused (optional)
 * - timer_is_paused: boolean
 * - remaining_time: snapshot remaining seconds (used when paused/autosave)
 *
 * If timer is running:
 *   remaining = max(0, remaining_time - elapsed_since(timer_started_at))
 *
 * If timer is paused:
 *   remaining = remaining_time
 */

export function computeRemainingSeconds(sessionRow) {
  const duration = Number(sessionRow.duration_sec ?? 3600);

  // If remaining_time is NULL, initialize it to duration (older rows)
  let baseRemaining = sessionRow.remaining_time == null ? duration : Number(sessionRow.remaining_time);

  const isPaused = !!sessionRow.timer_is_paused;

  if (isPaused) {
    return clampInt(baseRemaining, 0, duration);
  }

  const startedAt = sessionRow.timer_started_at ? new Date(sessionRow.timer_started_at).getTime() : null;
  if (!startedAt) {
    // Not started yet => treat as full remaining
    return clampInt(baseRemaining, 0, duration);
  }

  const now = Date.now();
  const elapsedSec = Math.floor((now - startedAt) / 1000);
  const remaining = baseRemaining - elapsedSec;
  return clampInt(remaining, 0, duration);
}

export function clampInt(n, a, b) {
  const x = Math.floor(Number(n || 0));
  return Math.max(a, Math.min(b, x));
}

/**
 * Normalize answers payload (object or jsonb already)
 */
export function safeAnswersPayload(answers) {
  if (!answers) return {};
  if (typeof answers === "object") return answers;
  return {};
}
