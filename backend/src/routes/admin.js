const express = require('express');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const pool = require('../config/db');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAdminAction } = require('../utils/audit');
const { checkPasswordStrength } = require('../utils/password');
const { getReportScheduleStatus, runReportExport } = require('../services/reportScheduler');
const {
  USER_PREFIX,
  SLOT_PREFIX,
  generateUniquePublicId,
  resolveUserIdentifier,
  resolveSlotIdentifier,
} = require('../services/publicIdentifiers');
const {
  applyPaymentOutcome,
  cancelPendingSelectionsForSlot,
  expirePendingSelections,
  resyncAllSlotStatuses,
  syncSlotStatus,
} = require('../services/bookingLifecycle');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));
router.use(async (req, res, next) => {
  try {
    await expirePendingSelections(pool);
    return next();
  } catch (err) {
    return next(err);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT user_id, public_user_id AS user_code, name, email, phone, user_type, status, vehicle_number, created_at
       FROM users ORDER BY created_at DESC`
    );
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});

router.post(
  '/users',
  [
    body('name').trim().isLength({ min: 2, max: 120 }),
    body('email').isEmail().normalizeEmail(),
    body('user_type').isIn(['driver', 'attendant', 'admin']),
    body('password')
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
      const { name, email, user_type, password } = req.body;
      const [existing] = await pool.query(
        'SELECT user_id FROM users WHERE email = ? LIMIT 1',
        [email]
      );
      if (existing.length) {
        return res.status(409).json({ message: 'Email already in use' });
      }

      const hash = await bcrypt.hash(password, 10);
      const publicUserId = await generateUniquePublicId(pool, 'users', 'public_user_id', USER_PREFIX);
      const [result] = await pool.query(
        `INSERT INTO users (public_user_id, name, email, password_hash, user_type)
         VALUES (?, ?, ?, ?, ?)`,
        [publicUserId, name, email, hash, user_type]
      );

      await logAdminAction({
        req,
        action: 'USER_CREATE',
        entityType: 'user',
        entityId: result.insertId,
        details: { email, user_type },
      });

      return res.status(201).json({ user_id: result.insertId, user_code: publicUserId });
    } catch (err) {
      return next(err);
    }
  }
);

router.patch(
  '/users/:id',
  [
    body('name').optional().isLength({ min: 2, max: 120 }),
    body('email').optional().isEmail().normalizeEmail(),
    body('phone').optional().isLength({ min: 6, max: 40 }),
    body('vehicle_number').optional().isLength({ min: 3, max: 60 }),
    body('user_type').optional().isIn(['driver', 'attendant', 'admin']),
    body('status').optional().isIn(['active', 'inactive']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const fields = [];
      const values = [];
      const allowed = ['name', 'email', 'phone', 'vehicle_number', 'user_type', 'status'];
      allowed.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(req.body, key)) {
          fields.push(`${key} = ?`);
          values.push(req.body[key]);
        }
      });

      if (!fields.length) {
        return res.status(400).json({ message: 'No fields to update' });
      }

      const userRecord = await resolveUserIdentifier(pool, req.params.id);
      if (!userRecord) {
        return res.status(404).json({ message: 'User not found' });
      }

      values.push(userRecord.user_id);
      const [result] = await pool.query(
        `UPDATE users SET ${fields.join(', ')} WHERE user_id = ?`,
        values
      );

      await logAdminAction({
        req,
        action: 'USER_UPDATE',
        entityType: 'user',
        entityId: userRecord.user_id,
        details: req.body,
      });

      return res.json({ updated: result.affectedRows, user_code: userRecord.public_user_id });
    } catch (err) {
      return next(err);
    }
  }
);

router.get('/bookings', async (req, res, next) => {
  try {
    const filters = [];
    const params = [];
    const allowedStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];

    if (allowedStatuses.includes(req.query.status)) {
      filters.push('b.status = ?');
      params.push(req.query.status);
    }
    if (req.query.slot_id) {
      const slotRecord = await resolveSlotIdentifier(pool, req.query.slot_id);
      if (!slotRecord) {
        return res.json([]);
      }
      filters.push('b.slot_id = ?');
      params.push(slotRecord.slot_id);
    }
    if (req.query.user_id) {
      const userRecord = await resolveUserIdentifier(pool, req.query.user_id);
      if (!userRecord) {
        return res.json([]);
      }
      filters.push('b.user_id = ?');
      params.push(userRecord.user_id);
    }
    if (req.query.date_from) {
      filters.push('DATE(b.start_time) >= ?');
      params.push(req.query.date_from);
    }
    if (req.query.date_to) {
      filters.push('DATE(b.end_time) <= ?');
      params.push(req.query.date_to);
    }

    let sql = `SELECT b.booking_id, b.user_id, b.slot_id, b.start_time, b.end_time, b.total_cost, b.status,
                      u.public_user_id AS user_code, u.name AS driver_name, u.email AS driver_email, u.vehicle_number,
                      s.public_slot_id AS slot_code, s.slot_number, s.location,
                      p.payment_id, p.status AS payment_status, p.payment_method, p.amount AS payment_amount
               FROM bookings b
               JOIN users u ON u.user_id = b.user_id
               JOIN parking_slots s ON s.slot_id = b.slot_id
               LEFT JOIN payments p ON p.booking_id = b.booking_id`;
    if (filters.length) {
      sql += ` WHERE ${filters.join(' AND ')}`;
    }
    sql += ' ORDER BY b.created_at DESC LIMIT 200';

    const [rows] = await pool.query(sql, params);
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});

router.patch(
  '/bookings/:id',
  [
    body('status').optional().isIn(['pending', 'confirmed', 'cancelled', 'completed']),
    body('slot_id').optional().trim().isLength({ min: 1, max: 24 }),
    body('user_id').optional().trim().isLength({ min: 1, max: 24 }),
    body('start_time').optional().isISO8601(),
    body('end_time').optional().isISO8601(),
  ],
  validate,
  async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        `SELECT b.booking_id, b.user_id, b.slot_id, b.start_time, b.end_time, b.total_cost, b.status,
                s.hourly_rate
         FROM bookings b
         JOIN parking_slots s ON s.slot_id = b.slot_id
         WHERE b.booking_id = ?
         FOR UPDATE`,
        [req.params.id]
      );
      if (!rows.length) {
        await connection.rollback();
        return res.status(404).json({ message: 'Booking not found' });
      }

      const booking = rows[0];
      let newSlotId = booking.slot_id;
      let rate = Number(booking.hourly_rate || 0);
      let resolvedUserId = null;

      const targetStatus = req.body.status || booking.status;

      if (req.body.user_id) {
        const userRecord = await resolveUserIdentifier(connection, req.body.user_id);
        if (!userRecord) {
          await connection.rollback();
          return res.status(404).json({ message: 'User not found' });
        }
        resolvedUserId = userRecord.user_id;
      }

      const start = req.body.start_time ? new Date(req.body.start_time) : new Date(booking.start_time);
      const end = req.body.end_time ? new Date(req.body.end_time) : new Date(booking.end_time);
      if ((req.body.start_time || req.body.end_time) && end <= start) {
        await connection.rollback();
        return res.status(422).json({ message: 'End time must be after start time' });
      }

      if (req.body.slot_id) {
        const slotRecord = await resolveSlotIdentifier(connection, req.body.slot_id);
        if (!slotRecord) {
          await connection.rollback();
          return res.status(404).json({ message: 'Slot not found' });
        }
        newSlotId = slotRecord.slot_id;
      }

      await syncSlotStatus(connection, newSlotId);
      const [slotRows] = await connection.query(
        'SELECT slot_id, status, hourly_rate FROM parking_slots WHERE slot_id = ? FOR UPDATE',
        [newSlotId]
      );
      if (!slotRows.length) {
        await connection.rollback();
        return res.status(404).json({ message: 'Slot not found' });
      }

      const slot = slotRows[0];
      rate = Number(slot.hourly_rate || 0);
      if (['occupied', 'maintenance'].includes(slot.status)) {
        await connection.rollback();
        return res.status(409).json({ message: 'Slot unavailable' });
      }

      const [conflictingConfirmed] = await connection.query(
        `SELECT booking_id
         FROM bookings
         WHERE slot_id = ? AND booking_id <> ? AND status = 'confirmed' AND end_time >= NOW()
         LIMIT 1`,
        [newSlotId, booking.booking_id]
      );
      if (conflictingConfirmed.length) {
        await connection.rollback();
        return res.status(409).json({ message: 'Slot already secured by another booking' });
      }

      let totalCost = Number(booking.total_cost || 0);
      if (req.body.start_time || req.body.end_time || req.body.slot_id) {
        const hours = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60)));
        totalCost = rate * hours;
      }

      const updates = [];
      const values = [];
      if (req.body.status) {
        updates.push('status = ?');
        values.push(targetStatus);
      }
      if (req.body.slot_id) {
        updates.push('slot_id = ?');
        values.push(newSlotId);
      }
      if (req.body.user_id) {
        updates.push('user_id = ?');
        values.push(resolvedUserId);
      }
      if (req.body.start_time) {
        updates.push('start_time = ?');
        values.push(start);
      }
      if (req.body.end_time) {
        updates.push('end_time = ?');
        values.push(end);
      }
      if (req.body.start_time || req.body.end_time || req.body.slot_id) {
        updates.push('total_cost = ?');
        values.push(totalCost);
      }

      if (!updates.length) {
        await connection.rollback();
        return res.status(400).json({ message: 'No fields to update' });
      }

      values.push(req.params.id);
      await connection.query(
        `UPDATE bookings SET ${updates.join(', ')} WHERE booking_id = ?`,
        values
      );

      if (req.body.start_time || req.body.end_time || req.body.slot_id) {
        await connection.query('UPDATE payments SET amount = ? WHERE booking_id = ?', [
          totalCost,
          req.params.id,
        ]);
      }

      if (targetStatus === 'cancelled') {
        await connection.query(
          `UPDATE payments
           SET status = CASE WHEN status = 'paid' THEN 'refunded' ELSE 'failed' END
           WHERE booking_id = ?`,
          [req.params.id]
        );
      } else if (targetStatus === 'completed') {
        await connection.query("UPDATE payments SET status = 'paid' WHERE booking_id = ?", [
          req.params.id,
        ]);
      } else if (targetStatus === 'pending') {
        await connection.query(
          `UPDATE payments
           SET status = CASE WHEN status = 'paid' THEN 'paid' ELSE 'pending' END
           WHERE booking_id = ?`,
          [req.params.id]
        );
      }

      if (newSlotId !== booking.slot_id) {
        await syncSlotStatus(connection, booking.slot_id);
      }

      if (targetStatus === 'confirmed') {
        await connection.query("UPDATE parking_slots SET status = 'booked' WHERE slot_id = ?", [newSlotId]);
        await cancelPendingSelectionsForSlot(connection, newSlotId, {
          excludeBookingId: booking.booking_id,
          reason: 'Slot secured during admin booking update.',
        });
      } else {
        await syncSlotStatus(connection, newSlotId);
      }

      await connection.commit();
      await logAdminAction({
        req,
        action: 'BOOKING_UPDATE',
        entityType: 'booking',
        entityId: Number(req.params.id),
        details: req.body,
      });
      return res.json({ message: 'Booking updated' });
    } catch (err) {
      await connection.rollback();
      return next(err);
    } finally {
      connection.release();
    }
  }
);

router.get('/slots', async (req, res, next) => {
  try {
    await resyncAllSlotStatuses(pool);
    const [rows] = await pool.query(
      'SELECT slot_id, public_slot_id AS slot_code, slot_number, location, hourly_rate, status FROM parking_slots ORDER BY slot_number'
    );
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});

router.post(
  '/slots',
  [
    body('slot_number').isLength({ min: 1, max: 40 }),
    body('location').optional().isLength({ min: 1, max: 120 }),
    body('hourly_rate').isFloat({ min: 0 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { slot_number, location, hourly_rate } = req.body;
      const publicSlotId = await generateUniquePublicId(pool, 'parking_slots', 'public_slot_id', SLOT_PREFIX);
      const [result] = await pool.query(
        `INSERT INTO parking_slots (public_slot_id, slot_number, location, hourly_rate, status)
         VALUES (?, ?, ?, ?, 'available')`,
        [publicSlotId, slot_number, location || null, hourly_rate]
      );
      await logAdminAction({
        req,
        action: 'SLOT_CREATE',
        entityType: 'slot',
        entityId: result.insertId,
        details: { slot_number, location, hourly_rate },
      });
      return res.status(201).json({ slot_id: result.insertId, slot_code: publicSlotId });
    } catch (err) {
      return next(err);
    }
  }
);

router.patch(
  '/slots/:id',
  [
    body('slot_number').optional().isLength({ min: 1, max: 40 }),
    body('location').optional().isLength({ min: 1, max: 120 }),
    body('hourly_rate').optional().isFloat({ min: 0 }),
    body('status').optional().isIn(['available', 'booked', 'occupied', 'maintenance']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const fields = [];
      const values = [];
      ['slot_number', 'location', 'hourly_rate', 'status'].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(req.body, key)) {
          fields.push(`${key} = ?`);
          values.push(req.body[key]);
        }
      });

      if (!fields.length) {
        return res.status(400).json({ message: 'No fields to update' });
      }

      const slotRecord = await resolveSlotIdentifier(pool, req.params.id);
      if (!slotRecord) {
        return res.status(404).json({ message: 'Slot not found' });
      }

      values.push(slotRecord.slot_id);
      const [result] = await pool.query(
        `UPDATE parking_slots SET ${fields.join(', ')} WHERE slot_id = ?`,
        values
      );
      await logAdminAction({
        req,
        action: 'SLOT_UPDATE',
        entityType: 'slot',
        entityId: slotRecord.slot_id,
        details: req.body,
      });
      return res.json({ updated: result.affectedRows, slot_code: slotRecord.public_slot_id });
    } catch (err) {
      return next(err);
    }
  }
);

router.patch(
  '/slots/:id/status',
  [body('status').isIn(['available', 'booked', 'occupied', 'maintenance'])],
  validate,
  async (req, res, next) => {
    try {
      const slotRecord = await resolveSlotIdentifier(pool, req.params.id);
      if (!slotRecord) {
        return res.status(404).json({ message: 'Slot not found' });
      }

      const [result] = await pool.query(
        'UPDATE parking_slots SET status = ? WHERE slot_id = ?',
        [req.body.status, slotRecord.slot_id]
      );
      await logAdminAction({
        req,
        action: 'SLOT_STATUS_UPDATE',
        entityType: 'slot',
        entityId: slotRecord.slot_id,
        details: { status: req.body.status },
      });
      return res.json({ updated: result.affectedRows, slot_code: slotRecord.public_slot_id });
    } catch (err) {
      return next(err);
    }
  }
);

router.get('/payments', async (req, res, next) => {
  try {
    const allowedStatuses = ['pending', 'paid', 'failed', 'refunded'];
    const statusFilter = allowedStatuses.includes(req.query.status)
      ? req.query.status
      : null;

    let sql = `SELECT p.payment_id, p.amount, p.payment_method, p.status, p.created_at,
                      p.transaction_id, p.checkout_request_id, p.merchant_request_id,
                      p.result_code, p.result_desc, p.admin_note,
                      b.booking_id, b.status AS booking_status, u.name AS driver_name
               FROM payments p
               JOIN bookings b ON b.booking_id = p.booking_id
               JOIN users u ON u.user_id = b.user_id`;
    const params = [];
    if (statusFilter) {
      sql += ' WHERE p.status = ?';
      params.push(statusFilter);
    }
    sql += ' ORDER BY p.created_at DESC';

    const [rows] = await pool.query(sql, params);
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});

router.post(
  '/payments/:id/status',
  [
    body('status').isIn(['pending', 'paid', 'failed', 'refunded']),
    body('note').optional().isLength({ min: 1, max: 255 }),
  ],
  validate,
  async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const outcome = await applyPaymentOutcome(connection, Number(req.params.id), req.body.status, {
        adminNote: req.body.note || null,
        resultDesc: req.body.note || null,
      });

      if (!outcome.found) {
        await connection.rollback();
        return res.status(404).json({ message: 'Payment not found' });
      }

      await connection.commit();
      await logAdminAction({
        req,
        action: 'PAYMENT_STATUS_UPDATE',
        entityType: 'payment',
        entityId: Number(req.params.id),
        details: { status: req.body.status, note: req.body.note || null },
      });
      return res.json({
        message: outcome.reviewMessage || 'Payment updated',
        payment_status: outcome.paymentStatus,
        booking_status: outcome.bookingStatus,
      });
    } catch (err) {
      await connection.rollback();
      return next(err);
    } finally {
      connection.release();
    }
  }
);

router.post('/payments/:id/mark-paid', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const outcome = await applyPaymentOutcome(connection, Number(req.params.id), 'paid', {
      adminNote: 'Marked as paid by admin.',
      resultDesc: 'Marked as paid by admin.',
    });

    if (!outcome.found) {
      await connection.rollback();
      return res.status(404).json({ message: 'Payment not found' });
    }

    await connection.commit();
    await logAdminAction({
      req,
      action: 'PAYMENT_MARK_PAID',
      entityType: 'payment',
      entityId: Number(req.params.id),
      details: { booking_id: outcome.bookingId },
    });
    return res.json({
      message: outcome.reviewMessage || 'Payment marked as paid',
      payment_status: outcome.paymentStatus,
      booking_status: outcome.bookingStatus,
    });
  } catch (err) {
    await connection.rollback();
    return next(err);
  } finally {
    connection.release();
  }
});

router.get('/reports/summary', async (req, res, next) => {
  try {
    await resyncAllSlotStatuses(pool);
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
  } catch (err) {
    return next(err);
  }
});

router.get('/reports/occupancy', async (req, res, next) => {
  try {
    await resyncAllSlotStatuses(pool);
    const [rows] = await pool.query(
      `SELECT status, COUNT(*) AS total
       FROM parking_slots
       GROUP BY status`
    );
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});

router.get('/reports/revenue', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT DATE(created_at) AS day, IFNULL(SUM(amount), 0) AS total
       FROM payments
       WHERE status = 'paid'
       GROUP BY DATE(created_at)
       ORDER BY day DESC
       LIMIT 14`
    );
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});

router.get('/reports/schedule', (req, res) => {
  return res.json(getReportScheduleStatus());
});

router.post('/reports/export', async (req, res, next) => {
  try {
    const result = await runReportExport();
    await logAdminAction({
      req,
      action: 'REPORT_EXPORT',
      entityType: 'report',
      entityId: null,
      details: { files: result?.files || [] },
    });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

router.get('/audit-logs', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const filters = [];
    const params = [];

    if (req.query.entity_type) {
      filters.push('entity_type = ?');
      params.push(req.query.entity_type);
    }
    if (req.query.entity_id) {
      filters.push('entity_id = ?');
      params.push(Number(req.query.entity_id));
    }
    if (req.query.admin_id) {
      filters.push('admin_id = ?');
      params.push(req.query.admin_id);
    }

    let sql = `SELECT audit_id, admin_id, action, entity_type, entity_id, details, ip_address, user_agent, created_at
               FROM audit_logs`;
    if (filters.length) {
      sql += ` WHERE ${filters.join(' AND ')}`;
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const [rows] = await pool.query(sql, params);
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;






