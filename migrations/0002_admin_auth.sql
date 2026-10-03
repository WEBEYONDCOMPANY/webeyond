CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry ON admin_sessions (expires_at);

-- A single shared login budget; no IP addresses or submitted emails are stored.
CREATE TABLE IF NOT EXISTS admin_login_throttle (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
