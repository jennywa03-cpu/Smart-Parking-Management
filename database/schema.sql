CREATE DATABASE IF NOT EXISTS Park_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE Park_db;

CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  public_user_id VARCHAR(24) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  phone VARCHAR(40) DEFAULT NULL,
  password_hash VARCHAR(255) NOT NULL,
  user_type ENUM('driver','attendant','admin') NOT NULL DEFAULT 'driver',
  vehicle_number VARCHAR(60) DEFAULT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  password_changed_at DATETIME DEFAULT NULL,
  failed_login_attempts INT NOT NULL DEFAULT 0,
  lock_until DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Admin bootstrap is handled from backend/.env at server startup.
-- Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD locally; do not commit live credentials.

CREATE TABLE IF NOT EXISTS parking_slots (
  slot_id INT AUTO_INCREMENT PRIMARY KEY,
  public_slot_id VARCHAR(24) NOT NULL UNIQUE,
  slot_number VARCHAR(40) NOT NULL UNIQUE,
  location VARCHAR(120) DEFAULT NULL,
  hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status ENUM('available','booked','occupied','maintenance') NOT NULL DEFAULT 'available',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bookings (
  booking_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  slot_id INT NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  total_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status ENUM('pending','confirmed','cancelled','completed') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_bookings_slot FOREIGN KEY (slot_id) REFERENCES parking_slots(slot_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  payment_id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  payment_method ENUM('cash','mobile_money') NOT NULL,
  provider VARCHAR(60) DEFAULT NULL,
  status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  transaction_id VARCHAR(120) DEFAULT NULL,
  external_reference VARCHAR(120) DEFAULT NULL,
  payer_phone VARCHAR(40) DEFAULT NULL,
  callback_payload TEXT DEFAULT NULL,
  checkout_request_id VARCHAR(120) DEFAULT NULL,
  merchant_request_id VARCHAR(120) DEFAULT NULL,
  result_code VARCHAR(40) DEFAULT NULL,
  result_desc VARCHAR(255) DEFAULT NULL,
  admin_note VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vehicle_entries (
  entry_id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT DEFAULT NULL,
  vehicle_number VARCHAR(60) NOT NULL,
  entry_time DATETIME NOT NULL,
  slot_id INT NOT NULL,
  attendant_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_entries_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
  CONSTRAINT fk_entries_slot FOREIGN KEY (slot_id) REFERENCES parking_slots(slot_id),
  CONSTRAINT fk_entries_attendant FOREIGN KEY (attendant_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vehicle_exits (
  exit_id INT AUTO_INCREMENT PRIMARY KEY,
  entry_id INT NOT NULL,
  exit_time DATETIME NOT NULL,
  attendant_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_exits_entry FOREIGN KEY (entry_id) REFERENCES vehicle_entries(entry_id),
  CONSTRAINT fk_exits_attendant FOREIGN KEY (attendant_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id INT DEFAULT NULL,
  details TEXT DEFAULT NULL,
  ip_address VARCHAR(64) DEFAULT NULL,
  user_agent VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_admin FOREIGN KEY (admin_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS password_resets (
  reset_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE INDEX idx_audit_admin ON audit_logs (admin_id);
CREATE INDEX idx_audit_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_logs (created_at);

CREATE INDEX idx_password_resets_user ON password_resets (user_id);
CREATE INDEX idx_password_resets_token ON password_resets (token_hash);

