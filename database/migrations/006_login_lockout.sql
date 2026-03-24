ALTER TABLE users
  ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN lock_until DATETIME DEFAULT NULL;

CREATE INDEX idx_users_lock_until ON users (lock_until);
