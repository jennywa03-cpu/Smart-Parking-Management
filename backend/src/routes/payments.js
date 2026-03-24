const express = require('express');
const crypto = require('crypto');
const pool = require('../config/db');
const { applyPaymentOutcome } = require('../services/bookingLifecycle');

const router = express.Router();

function verifySignature(req) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET || '';
  const signature = req.headers['x-park-signature'];
  if (!secret || !signature) return false;
  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const digest = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

router.post('/webhook', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    if (!verifySignature(req)) {
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const { transaction_id, status, external_reference } = req.body || {};
    if (!transaction_id || !status) {
      return res.status(400).json({ message: 'Missing payload fields' });
    }

    const [rows] = await connection.query(
      'SELECT payment_id, status FROM payments WHERE transaction_id = ? LIMIT 1',
      [transaction_id]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const payment = rows[0];
    if (payment.status === 'paid' && status === 'paid') {
      return res.json({ message: 'Already processed' });
    }

    const normalizedStatus =
      status === 'paid' || status === 'failed' || status === 'refunded' ? status : 'failed';

    await connection.beginTransaction();
    const outcome = await applyPaymentOutcome(connection, payment.payment_id, normalizedStatus, {
      externalReference: external_reference || null,
      callbackPayload: req.body,
      resultDesc: req.body?.result_desc || req.body?.message || null,
    });
    await connection.commit();

    return res.json({
      message: outcome.reviewMessage || 'Webhook processed',
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

router.post('/mpesa/callback', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const payload = req.body || {};
    const callback = payload.Body?.stkCallback || payload.body?.stkCallback || {};
    const checkoutId = callback.CheckoutRequestID || payload.CheckoutRequestID || null;
    const merchantId = callback.MerchantRequestID || payload.MerchantRequestID || null;
    const resultCode = callback.ResultCode ?? payload.ResultCode ?? null;
    const resultDesc = callback.ResultDesc || payload.ResultDesc || null;

    if (!checkoutId && !merchantId) {
      return res.status(400).json({ message: 'Missing checkout reference' });
    }

    const [rows] = await connection.query(
      `SELECT payment_id, status
       FROM payments
       WHERE checkout_request_id = ? OR merchant_request_id = ? OR transaction_id = ?
       LIMIT 1`,
      [checkoutId, merchantId, checkoutId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const payment = rows[0];
    const parsedResult = resultCode !== null ? Number(resultCode) : null;
    const normalizedStatus =
      parsedResult === 0 ? 'paid' : parsedResult === null ? 'pending' : 'failed';

    await connection.beginTransaction();
    const outcome = await applyPaymentOutcome(connection, payment.payment_id, normalizedStatus, {
      checkoutRequestId: checkoutId,
      merchantRequestId: merchantId,
      resultCode: resultCode !== null ? String(resultCode) : null,
      resultDesc,
      callbackPayload: payload,
    });
    await connection.commit();

    return res.json({
      message: outcome.reviewMessage || 'Callback received',
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

module.exports = router;
