-- Replace only the temporary shared counter; sessions and enquiries are untouched.
DROP TABLE IF EXISTS admin_login_throttle;
CREATE TABLE admin_login_throttle (
  client_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
CREATE INDEX admin_login_throttle_expiry ON admin_login_throttle (expires_at);
