ALTER TABLE public.test_sessions
  ADD COLUMN IF NOT EXISTS duration_sec integer NOT NULL DEFAULT 3600,
  ADD COLUMN IF NOT EXISTS timer_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS timer_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS timer_is_paused boolean NOT NULL DEFAULT false;

-- remaining_time already exists in your schema (integer).
-- We'll treat it as "server snapshot remaining seconds" when paused or autosaved.

CREATE INDEX IF NOT EXISTS idx_test_sessions_user_active
  ON public.test_sessions (user_id, is_submitted, created_at DESC);
