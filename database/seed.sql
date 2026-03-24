USE Park_db;

-- Admin bootstrap is handled from backend/.env at server startup.
-- Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD locally; do not commit live credentials.

INSERT INTO parking_slots (public_slot_id, slot_number, location, hourly_rate, status)
VALUES
  ('SLT-A001', 'A-01', 'Zone A', 50.00, 'available'),
  ('SLT-A002', 'A-02', 'Zone A', 50.00, 'available'),
  ('SLT-A003', 'A-03', 'Zone A', 50.00, 'available'),
  ('SLT-A004', 'A-04', 'Zone A', 50.00, 'available'),
  ('SLT-A005', 'A-05', 'Zone A', 50.00, 'available'),
  ('SLT-A006', 'A-06', 'Zone A', 50.00, 'available'),
  ('SLT-A007', 'A-07', 'Zone A', 50.00, 'available'),
  ('SLT-A008', 'A-08', 'Zone A', 50.00, 'available'),
  ('SLT-B001', 'B-01', 'Zone B', 50.00, 'available'),
  ('SLT-B002', 'B-02', 'Zone B', 50.00, 'available'),
  ('SLT-B003', 'B-03', 'Zone B', 50.00, 'available'),
  ('SLT-B004', 'B-04', 'Zone B', 50.00, 'available'),
  ('SLT-B005', 'B-05', 'Zone B', 50.00, 'available'),
  ('SLT-B006', 'B-06', 'Zone B', 50.00, 'available'),
  ('SLT-B007', 'B-07', 'Zone B', 50.00, 'available'),
  ('SLT-B008', 'B-08', 'Zone B', 50.00, 'available'),
  ('SLT-C001', 'C-01', 'Zone C', 50.00, 'available'),
  ('SLT-C002', 'C-02', 'Zone C', 50.00, 'available'),
  ('SLT-C003', 'C-03', 'Zone C', 50.00, 'available'),
  ('SLT-C004', 'C-04', 'Zone C', 50.00, 'available'),
  ('SLT-C005', 'C-05', 'Zone C', 50.00, 'available'),
  ('SLT-C006', 'C-06', 'Zone C', 50.00, 'available'),
  ('SLT-C007', 'C-07', 'Zone C', 50.00, 'available'),
  ('SLT-C008', 'C-08', 'Zone C', 50.00, 'available');
