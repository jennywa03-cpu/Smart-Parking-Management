USE Park_db;

-- Admin bootstrap is handled from backend/.env at server startup.
-- Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD locally; do not commit live credentials.

INSERT INTO parking_slots (public_slot_id, slot_number, location, hourly_rate, status)
VALUES
  ('SLT-A01Q7H2K', 'A-01', 'Zone A', 50.00, 'available'),
  ('SLT-A02R8J3M', 'A-02', 'Zone A', 50.00, 'available'),
  ('SLT-A03T9L4P', 'A-03', 'Zone A', 50.00, 'available'),
  ('SLT-A04V2N5R', 'A-04', 'Zone A', 50.00, 'available'),
  ('SLT-A05X3P6T', 'A-05', 'Zone A', 50.00, 'available'),
  ('SLT-A06Z4R7V', 'A-06', 'Zone A', 50.00, 'available'),
  ('SLT-A07B5T8X', 'A-07', 'Zone A', 50.00, 'available'),
  ('SLT-A08D6V9Z', 'A-08', 'Zone A', 50.00, 'available'),
  ('SLT-B01F7X2H', 'B-01', 'Zone B', 50.00, 'available'),
  ('SLT-B02H8Z3J', 'B-02', 'Zone B', 50.00, 'available'),
  ('SLT-B03J9B4L', 'B-03', 'Zone B', 50.00, 'available'),
  ('SLT-B04L2D5N', 'B-04', 'Zone B', 50.00, 'available'),
  ('SLT-B05N3F6Q', 'B-05', 'Zone B', 50.00, 'available'),
  ('SLT-B06Q4H7S', 'B-06', 'Zone B', 50.00, 'available'),
  ('SLT-B07S5J8U', 'B-07', 'Zone B', 50.00, 'available'),
  ('SLT-B08U6L9W', 'B-08', 'Zone B', 50.00, 'available'),
  ('SLT-C01W7N2Y', 'C-01', 'Zone C', 50.00, 'available'),
  ('SLT-C02Y8Q3A', 'C-02', 'Zone C', 50.00, 'available'),
  ('SLT-C03A9S4C', 'C-03', 'Zone C', 50.00, 'available'),
  ('SLT-C04C2U5E', 'C-04', 'Zone C', 50.00, 'available'),
  ('SLT-C05E3W6G', 'C-05', 'Zone C', 50.00, 'available'),
  ('SLT-C06G4Y7J', 'C-06', 'Zone C', 50.00, 'available'),
  ('SLT-C07J5A8L', 'C-07', 'Zone C', 50.00, 'available'),
  ('SLT-C08L6C9N', 'C-08', 'Zone C', 50.00, 'available')
ON DUPLICATE KEY UPDATE
  public_slot_id = VALUES(public_slot_id),
  location = VALUES(location),
  hourly_rate = VALUES(hourly_rate),
  status = VALUES(status);
