USE Park_db;

ALTER TABLE payments
  ADD COLUMN admin_note VARCHAR(255) DEFAULT NULL AFTER result_desc;
