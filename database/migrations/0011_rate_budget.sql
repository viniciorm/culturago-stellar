-- Shared, durable rate limit and relayer budget windows.
CREATE TABLE IF NOT EXISTS rate_budget_windows (
  actor_id TEXT NOT NULL,
  window_type TEXT NOT NULL CHECK (window_type IN ('rate', 'budget')),
  count INT NOT NULL DEFAULT 0,
  reset_at BIGINT NOT NULL,
  PRIMARY KEY (actor_id, window_type)
);

CREATE INDEX IF NOT EXISTS idx_rate_budget_windows_reset_at
  ON rate_budget_windows (reset_at);
