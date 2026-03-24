USE Park_db;

ALTER TABLE payments
  ADD COLUMN provider VARCHAR(60) DEFAULT NULL AFTER payment_method,
  ADD COLUMN external_reference VARCHAR(120) DEFAULT NULL AFTER transaction_id,
  ADD COLUMN payer_phone VARCHAR(40) DEFAULT NULL AFTER external_reference,
  ADD COLUMN callback_payload TEXT DEFAULT NULL AFTER payer_phone,
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;
