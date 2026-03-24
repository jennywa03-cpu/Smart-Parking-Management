ALTER TABLE users
  ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER status;

ALTER TABLE users
  ADD COLUMN password_changed_at DATETIME DEFAULT NULL AFTER must_change_password;

-- Admin bootstrap credentials are supplied through backend/.env at runtime.
-- This keeps live deployment credentials out of version control.
