USE Park_db;

ALTER TABLE payments
  ADD COLUMN checkout_request_id VARCHAR(120) DEFAULT NULL AFTER callback_payload,
  ADD COLUMN merchant_request_id VARCHAR(120) DEFAULT NULL AFTER checkout_request_id,
  ADD COLUMN result_code VARCHAR(40) DEFAULT NULL AFTER merchant_request_id,
  ADD COLUMN result_desc VARCHAR(255) DEFAULT NULL AFTER result_code;
