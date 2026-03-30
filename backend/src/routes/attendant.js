const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const pool = require('../config/db');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { cancelPendingSelectionsForSlot, expirePendingSelections, resyncAllSlotStatuses } = require('../services/bookingLifecycle');
const { USER_PREFIX, generateUniquePublicId } = require('../services/publicIdentifiers');

const router = express.Router();

router.use(requireAuth, requireRole('attendant'));
router.use(async (req, res, next) => {
  try {
    await expirePendingSelections(pool);
    return next();
  } catch (err) {
    return next(err);
  }
});

async function getOrCreateWalkInUser(connection, vehicleNumber) {
  const normalizedVehicle = vehicleNumber.trim();
  const [existing] = await connection.query(
    'SELECT user_id FROM users WHERE vehicle_number = ? LIMIT 1',
    [normalizedVehicle]
  );
  if (existing.length) {
    return existing[0].user_id;
  }

  const base = normalizedVehicle.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'guest';
  let email = `walkin_${base}@local`;
  const [emailRows] = await connection.query(
    'SELECT user_id FROM users WHERE email = ? LIMIT 1',
    [email]
  );
  if (emailRows.length) {
    email = `walkin_${base}_${Date.now()}@local`;
  }
  const password = crypto.randomBytes(12).toString('hex');
  const hash = await bcrypt.hash(password, 10);
  const name = `Walk-in ${normalizedVehicle}`;
  const publicUserId = await generateUniquePublicId(connection, 'users', 'public_user_id', USER_PREFIX);
  const [result] = await connection.query(
    `INSERT INTO users (public_user_id, name, email, password_hash, user_type, vehicle_number, status)
     VALUES (?, ?, ?, ?, 'driver', ?, 'active')`,
    [publicUserId, name, email, hash, normalizedVehicle]
  );
  return result.insertId;
}

function formatReservationDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value || '');
  }
  return date.toISOString().replace('T', ' ').slice(0, 16);
}

function getReservationWindowState(startTime, endTime, databaseWindowState = '') {
  const normalizedDatabaseWindowState = String(databaseWindowState || '').trim().toLowerCase();
  if (normalizedDatabaseWindowState === 'too_early') {
    return { ok: false, reason: 'too_early' };
  }
  if (normalizedDatabaseWindowState === 'expired') {
    return { ok: false, reason: 'expired' };
  }
  if (normalizedDatabaseWindowState === 'active') {
    return { ok: true, reason: 'active' };
  }

  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  const now = Date.now();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { ok: false, reason: 'invalid', startMs, endMs };
  }
  if (now < startMs) {
    return { ok: false, reason: 'too_early', startMs, endMs };
  }
  if (now > endMs) {
    return { ok: false, reason: 'expired', startMs, endMs };
  }
  return { ok: true, reason: 'active', startMs, endMs };
}

function buildReservationWindowMessage(reservation, windowState) {
  const slotLabel = reservation?.slot_number || '-';
  if (windowState.reason === 'too_early') {
    return `Reservation for Slot ${slotLabel} starts at ${formatReservationDateTime(reservation.start_time)} and is not ready for entry yet.`;
  }
  if (windowState.reason === 'expired') {
    return `Reservation for Slot ${slotLabel} ended at ${formatReservationDateTime(reservation.end_time)} and can no longer be used for entry.`;
  }
  return 'Reservation timing is invalid for entry.';
}

router.get('/slots', async (req, res, next) => {
  try {
    await resyncAllSlotStatuses(pool);
    const [rows] = await pool.query(
      'SELECT slot_id, public_slot_id AS slot_code, slot_number, location, hourly_rate, status FROM parking_slots'
    );
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});

router.get('/reservations', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.booking_id, b.start_time, b.end_time, b.status,
              CASE
                WHEN NOW() < b.start_time THEN 'too_early'
                WHEN NOW() > b.end_time THEN 'expired'
                ELSE 'active'
              END AS window_state,
              u.name AS driver_name, u.vehicle_number,
              s.slot_number, s.slot_id, s.public_slot_id AS slot_code
       FROM bookings b
       JOIN users u ON u.user_id = b.user_id
       JOIN parking_slots s ON s.slot_id = b.slot_id
       WHERE b.status IN ('pending','confirmed')
         AND b.end_time >= NOW()
       ORDER BY
         CASE
           WHEN NOW() BETWEEN b.start_time AND b.end_time THEN 0
           WHEN b.start_time > NOW() THEN 1
           ELSE 2
         END,
         b.start_time ASC`
    );
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});

router.get('/reservations/lookup', async (req, res, next) => {
  try {
    const vehicleNumber = String(req.query.vehicle_number || '').trim();
    if (!vehicleNumber) {
      return res.status(400).json({ message: 'Vehicle number required' });
    }
    const [rows] = await pool.query(
      `SELECT b.booking_id, b.start_time, b.end_time, b.status,
              CASE
                WHEN NOW() < b.start_time THEN 'too_early'
                WHEN NOW() > b.end_time THEN 'expired'
                ELSE 'active'
              END AS window_state,
              s.slot_id, s.public_slot_id AS slot_code, s.slot_number, s.location,
              u.name AS driver_name, u.vehicle_number
       FROM bookings b
       JOIN users u ON u.user_id = b.user_id
       JOIN parking_slots s ON s.slot_id = b.slot_id
       WHERE u.vehicle_number = ? AND b.status IN ('pending','confirmed')
         AND b.end_time >= NOW()
       ORDER BY
         CASE
           WHEN NOW() BETWEEN b.start_time AND b.end_time THEN 0
           WHEN b.start_time > NOW() THEN 1
           ELSE 2
         END,
         b.start_time ASC
       LIMIT 1`,
      [vehicleNumber]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'No active reservation found' });
    }

    const reservation = rows[0];
    const windowState = getReservationWindowState(reservation.start_time, reservation.end_time, reservation.window_state);
    if (!windowState.ok) {
      return res.status(409).json({ message: buildReservationWindowMessage(reservation, windowState) });
    }
    return res.json(reservation);
  } catch (err) {
    return next(err);
  }
});

router.get('/entries/active', async (req, res, next) => {
  try {
    const vehicleNumber = String(req.query.vehicle_number || '').trim();
    if (!vehicleNumber) {
      return res.status(400).json({ message: 'Vehicle number required' });
    }
    const [rows] = await pool.query(
      `SELECT ve.entry_id, ve.entry_time, ve.slot_id, ve.booking_id,
              ps.public_slot_id AS slot_code, ps.slot_number, ps.hourly_rate,
              b.status AS booking_status,
              p.status AS payment_status, p.payment_method
       FROM vehicle_entries ve
       JOIN parking_slots ps ON ps.slot_id = ve.slot_id
       LEFT JOIN bookings b ON b.booking_id = ve.booking_id
       LEFT JOIN payments p ON p.booking_id = b.booking_id
       LEFT JOIN vehicle_exits vx ON vx.entry_id = ve.entry_id
       WHERE ve.vehicle_number = ? AND vx.exit_id IS NULL
       ORDER BY ve.entry_time DESC
       LIMIT 1`,
      [vehicleNumber]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'Active entry not found' });
    }
    const entry = rows[0];
    const entryTime = new Date(entry.entry_time);
    const now = new Date();
    const hours = Math.max(1, Math.ceil((now - entryTime) / (1000 * 60 * 60)));
    const estimate = Number(entry.hourly_rate) * hours;
    return res.json({
      entry_id: entry.entry_id,
      entry_time: entry.entry_time,
      slot_id: entry.slot_id,
      slot_code: entry.slot_code,
      slot_number: entry.slot_number,
      booking_id: entry.booking_id,
      booking_status: entry.booking_status,
      payment_status: entry.payment_status,
      payment_method: entry.payment_method,
      duration_hours: hours,
      estimated_total: estimate,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/reservations/:id/verify', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT booking_id, slot_id, status FROM bookings WHERE booking_id = ? FOR UPDATE',
      [req.params.id]
    );
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Reservation not found' });
    }
    const booking = rows[0];
    if (booking.status === 'cancelled') {
      await connection.rollback();
      return res.status(409).json({ message: 'Reservation cancelled' });
    }
    await connection.query(
      "UPDATE bookings SET status = 'confirmed' WHERE booking_id = ?",
      [booking.booking_id]
    );
    await connection.query(
      "UPDATE parking_slots SET status = 'booked' WHERE slot_id = ?",
      [booking.slot_id]
    );
    await cancelPendingSelectionsForSlot(connection, booking.slot_id, {
      excludeBookingId: booking.booking_id,
      reason: 'Slot secured during attendant verification.',
    });
    await connection.commit();
    return res.json({ message: 'Reservation verified' });
  } catch (err) {
    await connection.rollback();
    return next(err);
  } finally {
    connection.release();
  }
});

router.post(
  '/entry',
  [
    body('vehicle_number').isLength({ min: 3, max: 60 }),
    body('slot_id').isInt({ min: 1 }),
    body('booking_id').optional().isInt({ min: 1 }),
  ],
  validate,
  async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
      const { vehicle_number, slot_id, booking_id } = req.body;
      let selectedSlotId = Number(slot_id);
      let resolvedBookingId = booking_id ? Number(booking_id) : null;

      await connection.beginTransaction();
      if (resolvedBookingId) {
        const [bookingRows] = await connection.query(
          `SELECT b.booking_id, b.slot_id, b.status, b.start_time, b.end_time,
                  CASE
                    WHEN NOW() < b.start_time THEN 'too_early'
                    WHEN NOW() > b.end_time THEN 'expired'
                    ELSE 'active'
                  END AS window_state,
                  s.slot_number
           FROM bookings b
           JOIN parking_slots s ON s.slot_id = b.slot_id
           WHERE b.booking_id = ?
           FOR UPDATE`,
          [resolvedBookingId]
        );
        if (!bookingRows.length) {
          await connection.rollback();
          return res.status(404).json({ message: 'Reservation not found' });
        }
        const booking = bookingRows[0];
        if (['cancelled', 'completed'].includes(booking.status)) {
          await connection.rollback();
          return res.status(409).json({ message: 'Reservation is not active' });
        }

        const windowState = getReservationWindowState(booking.start_time, booking.end_time, booking.window_state);
        if (!windowState.ok) {
          await connection.rollback();
          return res.status(409).json({ message: buildReservationWindowMessage(booking, windowState) });
        }
        selectedSlotId = booking.slot_id;
      }

      const [slotRows] = await connection.query(
        'SELECT status FROM parking_slots WHERE slot_id = ? FOR UPDATE',
        [selectedSlotId]
      );
      if (!slotRows.length || ['occupied', 'maintenance'].includes(slotRows[0].status)) {
        await connection.rollback();
        return res.status(409).json({ message: 'Slot unavailable' });
      }

      if (!resolvedBookingId) {
        const userId = await getOrCreateWalkInUser(connection, vehicle_number);
        const [bookingResult] = await connection.query(
          `INSERT INTO bookings (user_id, slot_id, start_time, end_time, total_cost, status)
           VALUES (?, ?, NOW(), NOW(), 0, 'confirmed')`,
          [userId, selectedSlotId]
        );
        resolvedBookingId = bookingResult.insertId;
        await connection.query(
          `INSERT INTO payments (booking_id, amount, payment_method, status)
           VALUES (?, 0, 'cash', 'pending')`,
          [resolvedBookingId]
        );
      }

      const [entryResult] = await connection.query(
        `INSERT INTO vehicle_entries (booking_id, vehicle_number, entry_time, slot_id, attendant_id)
         VALUES (?, ?, NOW(), ?, ?)`,
        [resolvedBookingId || null, vehicle_number, selectedSlotId, req.user.id]
      );

      await connection.query(
        "UPDATE parking_slots SET status = 'occupied' WHERE slot_id = ?",
        [selectedSlotId]
      );

      if (resolvedBookingId) {
        await connection.query(
          "UPDATE bookings SET status = 'confirmed' WHERE booking_id = ?",
          [resolvedBookingId]
        );
      }

      await connection.commit();
      return res.status(201).json({
        entry_id: entryResult.insertId,
        booking_id: resolvedBookingId,
        slot_id: selectedSlotId,
      });
    } catch (err) {
      await connection.rollback();
      return next(err);
    } finally {
      connection.release();
    }
  }
);

router.post(
  '/exit',
  [body('vehicle_number').isLength({ min: 3, max: 60 })],
  validate,
  async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
      const { vehicle_number } = req.body;
      await connection.beginTransaction();

      const [entryRows] = await connection.query(
        `SELECT ve.entry_id, ve.entry_time, ve.slot_id, ve.booking_id,
                ps.hourly_rate, ps.slot_number,
                b.start_time, b.end_time,
                CASE
                  WHEN b.booking_id IS NULL THEN NULL
                  WHEN NOW() < b.start_time THEN 'too_early'
                  WHEN NOW() > b.end_time THEN 'expired'
                  ELSE 'active'
                END AS window_state,
                p.status AS payment_status, p.payment_method
         FROM vehicle_entries ve
         JOIN parking_slots ps ON ps.slot_id = ve.slot_id
         LEFT JOIN bookings b ON b.booking_id = ve.booking_id
         LEFT JOIN payments p ON p.booking_id = b.booking_id
         LEFT JOIN vehicle_exits vx ON vx.entry_id = ve.entry_id
         WHERE ve.vehicle_number = ? AND vx.exit_id IS NULL
         ORDER BY ve.entry_time DESC
         LIMIT 1
         FOR UPDATE`,
        [vehicle_number]
      );

      if (!entryRows.length) {
        await connection.rollback();
        return res.status(404).json({ message: 'Active entry not found' });
      }

      const entry = entryRows[0];
      if (entry.booking_id) {
        const windowState = getReservationWindowState(entry.start_time, entry.end_time, entry.window_state);
        if (!windowState.ok && windowState.reason === 'too_early') {
          await connection.rollback();
          return res.status(409).json({
            message: `Reservation for Slot ${entry.slot_number || '-'} has not reached its start time yet. Exit cannot be processed before ${formatReservationDateTime(entry.start_time)}.`
          });
        }
      }
      const entryTime = new Date(entry.entry_time);
      const exitTime = new Date();
      const hours = Math.max(1, Math.ceil((exitTime - entryTime) / (1000 * 60 * 60)));
      const totalCost = Number(entry.hourly_rate) * hours;

      const [exitResult] = await connection.query(
        `INSERT INTO vehicle_exits (entry_id, exit_time, attendant_id)
         VALUES (?, NOW(), ?)`,
        [entry.entry_id, req.user.id]
      );

      await connection.query(
        "UPDATE parking_slots SET status = 'available' WHERE slot_id = ?",
        [entry.slot_id]
      );

      if (entry.booking_id) {
        await connection.query(
          "UPDATE bookings SET status = 'completed', end_time = NOW(), total_cost = ? WHERE booking_id = ?",
          [totalCost, entry.booking_id]
        );
        await connection.query(
          "UPDATE payments SET amount = ? WHERE booking_id = ?",
          [totalCost, entry.booking_id]
        );
      }

      await connection.commit();
      return res.json({
        exit_id: exitResult.insertId,
        total_cost: totalCost,
        duration_hours: hours,
        entry_time: entry.entry_time,
        exit_time: exitTime,
        slot_number: entry.slot_number,
        payment_method: entry.payment_method,
        payment_status: entry.payment_status,
      });
    } catch (err) {
      await connection.rollback();
      return next(err);
    } finally {
      connection.release();
    }
  }
);

module.exports = router;







