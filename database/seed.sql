USE Park_db;

INSERT INTO users (public_user_id, name, email, phone, password_hash, user_type, status)
VALUES
  ('USR-ADMIN01', 'Jane Mwangi', 'janemwangi@gmail.com', '0700000000', '$2a$10$HLP7JumjzwpDesjMeCv5DOfofzN6IyA2JYNnsD0t7aEd97.zsfxx2', 'admin', 'active'),
  ('USR-ATTD01', 'Front Desk', 'attendant@park.local', '0700000001', '$2a$10$HLP7JumjzwpDesjMeCv5DOfofzN6IyA2JYNnsD0t7aEd97.zsfxx2', 'attendant', 'active');

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

