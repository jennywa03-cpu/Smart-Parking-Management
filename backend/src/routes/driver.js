const express = require('express');
const { body } = require('express-validator');
const pool = require('../config/db');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { stkPush, normalizePhone, generateReference } = require('../services/mpesa');
const {
  cancelDriverPendingSelections,
  cancelPendingSelectionsForSlot,
  expirePendingSelections,
  getPendingHoldSeconds,
  resyncAllSlotStatuses,
  syncSlotStatus,
} = require('../services/bookingLifecycle');

const router = express.Router();
const PAYMENT_HOLD_SECONDS = getPendingHoldSeconds();

router.use(requireAuth, requireRole('driver'));
router.use(async (req, res, next) => {
  try {
    await expirePendingSelections(pool);
    return next();
  } catch (err) {
    return next(err);
  }
});

router.get('/slots', async (req, res, next) => {
  try {
    await resyncAllSlotStatuses(pool);
    const [rows] = await pool.query(
      "SELECT slot_id, public_slot_id AS slot_code, slot_number, location, hourly_rate, status FROM parking_slots ORDER BY slot_number"
    );
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});

router.get('/bookings', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.booking_id, b.start_time, b.end_time, b.total_cost, b.status AS booking_status, b.created_at,
              DATE_ADD(b.created_at, INTERVAL ${PAYMENT_HOLD_SECONDS} SECOND) AS payment_expires_at,
              TIMESTAMPDIFF(SECOND, NOW(), DATE_ADD(b.created_at, INTERVAL ${PAYMENT_HOLD_SECONDS} SECOND)) AS payment_seconds_remaining,
              s.public_slot_id AS slot_code, s.slot_number, s.location,
              p.payment_id, p.status AS payment_status, p.payment_method
       FROM bookings b
       JOIN parking_slots s ON s.slot_id = b.slot_id
       LEFT JOIN payments p ON p.booking_id = b.booking_id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC`,
      [req.user.id]
    );
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});

router.post(
  '/bookings',
  [
    body('slot_id').isInt({ min: 1 }),
    body('start_time').isISO8601(),
    body('end_time').isISO8601(),
    body('payment_method').isIn(['cash', 'mobile_money']),
  ],
  validate,
  async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
      const { slot_id, start_time, end_time, payment_method } = req.body;

      const start = new Date(start_time);
      const end = new Date(end_time);
      if (!(start instanceof Date) || Number.isNaN(start.getTime()) || !(end instanceof Date) || Number.isNaN(end.getTime())) {
        return res.status(422).json({ message: 'Invalid date range' });
      }
      if (end <= start) {
        return res.status(422).json({ message: 'End time must be after start time' });
      }

      await connection.beginTransaction();
      await expirePendingSelections(connection);
      await syncSlotStatus(connection, Number(slot_id));

      const [slotRows] = await connection.query(
        "SELECT status, hourly_rate FROM parking_slots WHERE slot_id = ? FOR UPDATE",
        [slot_id]
      );
      if (!slotRows.length || slotRows[0].status !== 'available') {
        await connection.rollback();
        return res.status(409).json({ message: 'Slot not available' });
      }

      const hours = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60)));
      const totalCost = Number(slotRows[0].hourly_rate) * hours;
      const bookingStatus = payment_method === 'mobile_money' ? 'pending' : 'confirmed';

      const [bookingResult] = await connection.query(
        `INSERT INTO bookings (user_id, slot_id, start_time, end_time, total_cost, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.id, slot_id, start, end, totalCost, bookingStatus]
      );

      const paymentStatus = 'pending';
      const [paymentResult] = await connection.query(
        `INSERT INTO payments (booking_id, amount, payment_method, status)
         VALUES (?, ?, ?, ?)`,
        [bookingResult.insertId, totalCost, payment_method, paymentStatus]
      );

      const releasedSelections = await cancelDriverPendingSelections(connection, req.user.id, {
        excludeBookingId: bookingResult.insertId,
        reason: 'Selection replaced by a newer slot choice.',
      });

      if (bookingStatus === 'confirmed') {
        await connection.query("UPDATE parking_slots SET status = 'booked' WHERE slot_id = ?", [slot_id]);
        await cancelPendingSelectionsForSlot(connection, Number(slot_id), {
          excludeBookingId: bookingResult.insertId,
          reason: 'Slot secured by a confirmed booking.',
        });
      } else {
        await syncSlotStatus(connection, Number(slot_id));
      }

      await connection.commit();
      return res.status(201).json({
        booking_id: bookingResult.insertId,
        payment_id: paymentResult.insertId,
        booking_status: bookingStatus,
        payment_status: paymentStatus,
        released_unpaid_bookings: releasedSelections,
        payment_hold_seconds: PAYMENT_HOLD_SECONDS,
        payment_expires_at: new Date(Date.now() + PAYMENT_HOLD_SECONDS * 1000).toISOString(),
        slot_locked: bookingStatus === 'confirmed',
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
  '/payments/initiate',
  [
    body('booking_id').isInt({ min: 1 }),
    body('provider').isLength({ min: 2, max: 60 }),
    body('phone').isLength({ min: 6, max: 40 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { booking_id, provider, phone } = req.body;
      const [rows] = await pool.query(
        `SELECT p.payment_id, p.status, p.payment_method, p.amount,
                p.checkout_request_id, p.transaction_id,
                b.status AS booking_status,
                DATE_ADD(b.created_at, INTERVAL ${PAYMENT_HOLD_SECONDS} SECOND) AS payment_expires_at,
                TIMESTAMPDIFF(SECOND, NOW(), DATE_ADD(b.created_at, INTERVAL ${PAYMENT_HOLD_SECONDS} SECOND)) AS payment_seconds_remaining,
                s.status AS slot_status
         FROM payments p
         JOIN bookings b ON b.booking_id = p.booking_id
         JOIN parking_slots s ON s.slot_id = b.slot_id
         WHERE p.booking_id = ? AND b.user_id = ?
         LIMIT 1`,
        [booking_id, req.user.id]
      );
      if (!rows.length) {
        return res.status(404).json({ message: 'Payment not found' });
      }

      const payment = rows[0];
      if (payment.payment_method !== 'mobile_money') {
        return res.status(400).json({ message: 'Payment method is not mobile money' });
      }
      if (payment.status === 'paid') {
        return res.status(409).json({ message: 'Payment already completed' });
      }
      if ((payment.payment_seconds_remaining || 0) <= 0 || ['cancelled', 'completed'].includes(payment.booking_status)) {
        return res.status(409).json({ message: 'This selection expired. Choose another slot to continue.' });
      }
      if (payment.slot_status !== 'available' && payment.booking_status !== 'confirmed') {
        return res.status(409).json({ message: 'This slot has already been secured by another booking.' });
      }

      if (provider.toLowerCase() === 'm-pesa') {
        if (process.env.MPESA_ENABLED !== 'true') {
          return res.status(503).json({ message: 'M-Pesa integration is disabled' });
        }

        const reference = process.env.MPESA_ACCOUNT_REFERENCE || generateReference();
        const msisdn = normalizePhone(phone);
        const stkResponse = await stkPush({
          amount: payment.amount,
          phone: msisdn,
          accountReference: reference,
          transactionDesc: process.env.MPESA_TRANSACTION_DESC || 'Parking payment',
        });

        const checkoutId = stkResponse.CheckoutRequestID || stkResponse.checkoutRequestId || null;
        const merchantId = stkResponse.MerchantRequestID || stkResponse.merchantRequestId || null;

        await pool.query(
          `UPDATE payments
           SET provider = ?, transaction_id = ?, payer_phone = ?, checkout_request_id = ?, merchant_request_id = ?, callback_payload = ?
           WHERE payment_id = ?`,
          [
            provider,
            checkoutId || reference,
            msisdn,
            checkoutId,
            merchantId,
            JSON.stringify(stkResponse),
            payment.payment_id,
          ]
        );

        return res.json({
          message: 'Payment initiated',
          checkout_request_id: checkoutId,
          merchant_request_id: merchantId,
          provider_response: stkResponse,
        });
      }

      const transactionId = `tx_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      await pool.query(
        `UPDATE payments
         SET provider = ?, transaction_id = ?, payer_phone = ?
         WHERE payment_id = ?`,
        [provider, transactionId, phone, payment.payment_id]
      );

      return res.json({
        message: 'Payment initiated',
        transaction_id: transactionId,
      });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;

