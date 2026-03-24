const express = require('express');
const { body } = require('express-validator');
const pool = require('../config/db');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { expirePendingSelections, resyncAllSlotStatuses } = require('../services/bookingLifecycle');
const { checkPasswordStrength } = require('../utils/password');

const router = express.Router();

router.use(requireAuth);
router.use(async (req, res, next) => {
  try {
    await expirePendingSelections(pool);
    return next();
  } catch (err) {
    return next(err);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT user_id, public_user_id AS user_code, name, email, phone, user_type, vehicle_number, status, must_change_password, created_at
       FROM users WHERE user_id = ? LIMIT 1`,
      [req.user.id]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json(rows[0]);
  } catch (err) {
    return next(err);
  }
});

router.patch(
  '/me',
  [
    body('name').optional().trim().isLength({ min: 2, max: 120 }),
    body('email').optional().isEmail().normalizeEmail(),
    body('phone').optional().isLength({ min: 6, max: 40 }),
    body('vehicle_number').optional().isLength({ min: 3, max: 60 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const fields = [];
      const values = [];
      const allowed = ['name', 'email', 'phone', 'vehicle_number'];
      allowed.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(req.body, key)) {
          fields.push(`${key} = ?`);
          values.push(req.body[key]);
        }
      });

      if (!fields.length) {
        return res.status(400).json({ message: 'No fields to update' });
      }

      if (req.body.email) {
        const [existing] = await pool.query(
          'SELECT user_id FROM users WHERE email = ? AND user_id <> ? LIMIT 1',
          [req.body.email, req.user.id]
        );
        if (existing.length) {
          return res.status(409).json({ message: 'Email already in use' });
        }
      }

      values.push(req.user.id);
      await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE user_id = ?`, values);

      const [rows] = await pool.query(
        `SELECT user_id, public_user_id AS user_code, name, email, phone, user_type, vehicle_number, status, must_change_password, created_at
         FROM users WHERE user_id = ? LIMIT 1`,
        [req.user.id]
      );
      return res.json(rows[0]);
    } catch (err) {
      return next(err);
    }
  }
);

router.post(
  '/change-password',
  [
    body('current_password').isLength({ min: 8, max: 120 }),
    body('new_password')
      .isLength({ min: 8, max: 120 })
      .custom((value) => {
        const result = checkPasswordStrength(value);
        if (!result.ok) {
          throw new Error(result.message);
        }
        return true;
      }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { current_password, new_password } = req.body;
      if (current_password === new_password) {
        return res.status(400).json({ message: 'New password must be different from the current password.' });
      }

      const [[user]] = await pool.query(
        'SELECT user_id, password_hash FROM users WHERE user_id = ? LIMIT 1',
        [req.user.id]
      );

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const bcrypt = require('bcryptjs');
      const matches = await bcrypt.compare(current_password, user.password_hash);
      if (!matches) {
        return res.status(401).json({ message: 'Current password is incorrect.' });
      }

      const passwordHash = await bcrypt.hash(new_password, 10);
      await pool.query(
        'UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = NOW(), failed_login_attempts = 0, lock_until = NULL WHERE user_id = ?',
        [passwordHash, req.user.id]
      );

      return res.json({ message: 'Password updated successfully.', must_change_password: false });
    } catch (err) {
      return next(err);
    }
  }
);

router.get('/slots', async (req, res, next) => {
  try {
    await resyncAllSlotStatuses(pool);
    if (req.user?.role === 'driver') {
      const [rows] = await pool.query(
        "SELECT slot_id, public_slot_id AS slot_code, slot_number, location, hourly_rate, status FROM parking_slots WHERE status = 'available' ORDER BY slot_number"
      );
      return res.json(rows);
    }

    const [rows] = await pool.query(
      'SELECT slot_id, public_slot_id AS slot_code, slot_number, location, hourly_rate, status FROM parking_slots ORDER BY slot_number'
    );
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});

router.get('/summary', async (req, res, next) => {
  try {
    await resyncAllSlotStatuses(pool);
    const role = req.user?.role || 'driver';

    if (role === 'admin') {
      const [[usersCount]] = await pool.query('SELECT COUNT(*) AS total_users FROM users');
      const [[slotsCount]] = await pool.query('SELECT COUNT(*) AS total_slots FROM parking_slots');
      const [[activeBookings]] = await pool.query(
        "SELECT COUNT(*) AS active_bookings FROM bookings WHERE status IN ('pending','confirmed')"
      );
      const [[revenue]] = await pool.query(
        "SELECT IFNULL(SUM(amount), 0) AS total_revenue FROM payments WHERE status = 'paid'"
      );
      const [[occupancy]] = await pool.query(
        `SELECT
           ROUND(SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100, 2) AS occupancy_rate
         FROM parking_slots`
      );

      return res.json({
        total_users: usersCount.total_users,
        total_slots: slotsCount.total_slots,
        active_bookings: activeBookings.active_bookings,
        total_revenue: revenue.total_revenue,
        occupancy_rate: occupancy.occupancy_rate || 0,
      });
    }

    if (role === 'attendant') {
      const [[slotsCount]] = await pool.query('SELECT COUNT(*) AS total_slots FROM parking_slots');
      const [[occupiedCount]] = await pool.query(
        "SELECT COUNT(*) AS occupied_slots FROM parking_slots WHERE status = 'occupied'"
      );
      const [[pendingReservations]] = await pool.query(
        "SELECT COUNT(*) AS pending_reservations FROM bookings WHERE status IN ('pending','confirmed')"
      );

      return res.json({
        total_slots: slotsCount.total_slots,
        occupied_slots: occupiedCount.occupied_slots,
        pending_reservations: pendingReservations.pending_reservations,
      });
    }

    const [[availableSlots]] = await pool.query(
      "SELECT COUNT(*) AS available_slots FROM parking_slots WHERE status = 'available'"
    );
    const [[activeBookings]] = await pool.query(
      "SELECT COUNT(*) AS my_active_bookings FROM bookings WHERE user_id = ? AND status IN ('pending','confirmed')",
      [req.user.id]
    );
    const [[totalBookings]] = await pool.query(
      'SELECT COUNT(*) AS my_total_bookings FROM bookings WHERE user_id = ?',
      [req.user.id]
    );

    return res.json({
      available_slots: availableSlots.available_slots,
      my_active_bookings: activeBookings.my_active_bookings,
      my_total_bookings: totalBookings.my_total_bookings,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;




