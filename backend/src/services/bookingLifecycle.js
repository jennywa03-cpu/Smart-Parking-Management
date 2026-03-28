const DEFAULT_PAYMENT_HOLD_SECONDS = 120;
const DEFAULT_EXPIRY_SCAN_MS = 30000;

const PENDING_MOBILE_FILTER = `
  b.status = 'pending'
  AND p.status = 'pending'
  AND p.payment_method = 'mobile_money'
`;

function getPendingHoldSeconds() {
  const value = Number(process.env.BOOKING_HOLD_SECONDS || DEFAULT_PAYMENT_HOLD_SECONDS);
  if (!Number.isFinite(value) || value < 1) {
    return DEFAULT_PAYMENT_HOLD_SECONDS;
  }
  return Math.floor(value);
}

async function syncSlotStatus(connection, slotId) {
  if (!slotId) return null;

  const [slotRows] = await connection.query(
    'SELECT slot_id, status FROM parking_slots WHERE slot_id = ? FOR UPDATE',
    [slotId]
  );
  if (!slotRows.length) return null;

  const slot = slotRows[0];
  if (slot.status === 'maintenance') {
    return 'maintenance';
  }

  const [entryRows] = await connection.query(
    `SELECT ve.entry_id
     FROM vehicle_entries ve
     LEFT JOIN vehicle_exits vx ON vx.entry_id = ve.entry_id
     WHERE ve.slot_id = ? AND vx.exit_id IS NULL
     LIMIT 1`,
    [slotId]
  );
  if (entryRows.length) {
    if (slot.status !== 'occupied') {
      await connection.query("UPDATE parking_slots SET status = 'occupied' WHERE slot_id = ?", [slotId]);
    }
    return 'occupied';
  }

  const [confirmedRows] = await connection.query(
    `SELECT booking_id
     FROM bookings
     WHERE slot_id = ? AND status = 'confirmed' AND end_time >= NOW()
     ORDER BY start_time ASC
     LIMIT 1`,
    [slotId]
  );

  const nextStatus = confirmedRows.length ? 'booked' : 'available';
  if (slot.status !== nextStatus) {
    await connection.query('UPDATE parking_slots SET status = ? WHERE slot_id = ?', [nextStatus, slotId]);
  }
  return nextStatus;
}

async function cancelPendingSelectionRows(connection, rows, reason) {
  if (!rows.length) return 0;

  const bookingIds = rows.map((row) => Number(row.booking_id));
  const paymentIds = rows.map((row) => Number(row.payment_id));
  const slotIds = [...new Set(rows.map((row) => Number(row.slot_id)).filter(Boolean))];

  const bookingPlaceholders = bookingIds.map(() => '?').join(', ');
  const paymentPlaceholders = paymentIds.map(() => '?').join(', ');

  await connection.query(
    `UPDATE bookings
     SET status = 'cancelled'
     WHERE booking_id IN (${bookingPlaceholders})`,
    bookingIds
  );

  await connection.query(
    `UPDATE payments
     SET status = 'failed', result_desc = ?
     WHERE payment_id IN (${paymentPlaceholders})`,
    [reason, ...paymentIds]
  );

  for (const slotId of slotIds) {
    await syncSlotStatus(connection, slotId);
  }

  return bookingIds.length;
}

async function expirePendingSelections(poolOrConnection, options = {}) {
  const holdSeconds = Number(options.holdSeconds || getPendingHoldSeconds());
  if (!Number.isFinite(holdSeconds) || holdSeconds < 1) {
    return { expiredCount: 0, holdSeconds: getPendingHoldSeconds() };
  }

  const hasPoolInterface = typeof poolOrConnection?.getConnection === 'function';
  const connection = hasPoolInterface ? await poolOrConnection.getConnection() : poolOrConnection;

  try {
    if (hasPoolInterface) {
      await connection.beginTransaction();
    }

    const [rows] = await connection.query(
      `SELECT b.booking_id, b.slot_id, p.payment_id
       FROM bookings b
       JOIN payments p ON p.booking_id = b.booking_id
       WHERE ${PENDING_MOBILE_FILTER}
         AND TIMESTAMPDIFF(SECOND, b.created_at, NOW()) >= ?
       FOR UPDATE`,
      [holdSeconds]
    );

    const expiredCount = await cancelPendingSelectionRows(
      connection,
      rows,
      `Payment window expired after ${holdSeconds} seconds.`
    );

    if (hasPoolInterface) {
      await connection.commit();
    }

    return { expiredCount, holdSeconds };
  } catch (err) {
    if (hasPoolInterface) {
      await connection.rollback();
    }
    throw err;
  } finally {
    if (hasPoolInterface && connection) {
      connection.release();
    }
  }
}

async function cancelDriverPendingSelections(connection, userId, options = {}) {
  const { excludeBookingId = null, reason = 'Selection replaced by a newer slot choice.' } = options;
  const values = [userId];
  let extraFilter = '';

  if (excludeBookingId) {
    extraFilter = ' AND b.booking_id <> ?';
    values.push(excludeBookingId);
  }

  const [rows] = await connection.query(
    `SELECT b.booking_id, b.slot_id, p.payment_id
     FROM bookings b
     JOIN payments p ON p.booking_id = b.booking_id
     WHERE b.user_id = ?
       AND ${PENDING_MOBILE_FILTER}${extraFilter}
     FOR UPDATE`,
    values
  );

  return cancelPendingSelectionRows(connection, rows, reason);
}

async function cancelPendingSelectionsForSlot(connection, slotId, options = {}) {
  const { excludeBookingId = null, reason = 'Slot secured by another confirmed booking.' } = options;
  const values = [slotId];
  let extraFilter = '';

  if (excludeBookingId) {
    extraFilter = ' AND b.booking_id <> ?';
    values.push(excludeBookingId);
  }

  const [rows] = await connection.query(
    `SELECT b.booking_id, b.slot_id, p.payment_id
     FROM bookings b
     JOIN payments p ON p.booking_id = b.booking_id
     WHERE b.slot_id = ?
       AND ${PENDING_MOBILE_FILTER}${extraFilter}
     FOR UPDATE`,
    values
  );

  return cancelPendingSelectionRows(connection, rows, reason);
}

async function applyPaymentOutcome(connection, paymentId, status, options = {}) {
  const [rows] = await connection.query(
    `SELECT p.payment_id, p.booking_id, p.status AS payment_status,
            p.payment_method,
            b.status AS booking_status, b.slot_id,
            s.status AS slot_status
     FROM payments p
     JOIN bookings b ON b.booking_id = p.booking_id
     JOIN parking_slots s ON s.slot_id = b.slot_id
     WHERE p.payment_id = ?
     LIMIT 1
     FOR UPDATE`,
    [paymentId]
  );

  if (!rows.length) {
    return { found: false };
  }

  const payment = rows[0];
  let finalPaymentStatus = status;
  let finalBookingStatus = payment.booking_status;
  let reviewMessage = null;

  if (status === 'paid') {
    const isCompletedCashBooking =
      String(payment.payment_method || '').toLowerCase() === 'cash' &&
      payment.booking_status === 'completed';

    if (isCompletedCashBooking) {
      finalBookingStatus = 'completed';
    } else if (['cancelled', 'completed'].includes(payment.booking_status)) {
      reviewMessage = 'Payment received for a closed booking. Manual review required.';
    } else if (['maintenance', 'occupied'].includes(payment.slot_status)) {
      finalBookingStatus = 'cancelled';
      reviewMessage = 'Payment received after the slot became unavailable. Manual review required.';
    } else if (payment.slot_status === 'booked' && payment.booking_status !== 'confirmed') {
      finalBookingStatus = 'cancelled';
      reviewMessage = 'Payment received after another booking secured this slot. Manual review required.';
    } else {
      finalBookingStatus = 'confirmed';
    }
  } else if (status === 'failed' || status === 'refunded') {
    if (payment.booking_status !== 'completed') {
      finalBookingStatus = 'cancelled';
    }
  } else if (status === 'pending') {
    if (!['cancelled', 'completed'].includes(payment.booking_status)) {
      finalBookingStatus = 'pending';
    }
  }

  const fields = ['status = ?'];
  const values = [finalPaymentStatus];

  if (Object.prototype.hasOwnProperty.call(options, 'externalReference')) {
    fields.push('external_reference = ?');
    values.push(options.externalReference);
  }
  if (Object.prototype.hasOwnProperty.call(options, 'provider')) {
    fields.push('provider = ?');
    values.push(options.provider);
  }
  if (Object.prototype.hasOwnProperty.call(options, 'transactionId')) {
    fields.push('transaction_id = ?');
    values.push(options.transactionId);
  }
  if (Object.prototype.hasOwnProperty.call(options, 'payerPhone')) {
    fields.push('payer_phone = ?');
    values.push(options.payerPhone);
  }
  if (Object.prototype.hasOwnProperty.call(options, 'checkoutRequestId')) {
    fields.push('checkout_request_id = ?');
    values.push(options.checkoutRequestId);
  }
  if (Object.prototype.hasOwnProperty.call(options, 'merchantRequestId')) {
    fields.push('merchant_request_id = ?');
    values.push(options.merchantRequestId);
  }
  if (Object.prototype.hasOwnProperty.call(options, 'resultCode')) {
    fields.push('result_code = ?');
    values.push(options.resultCode);
  }

  const resultDescription = reviewMessage || options.resultDesc;
  if (Object.prototype.hasOwnProperty.call(options, 'resultDesc') || reviewMessage) {
    fields.push('result_desc = ?');
    values.push(resultDescription || null);
  }
  if (Object.prototype.hasOwnProperty.call(options, 'adminNote')) {
    fields.push('admin_note = ?');
    values.push(options.adminNote || null);
  }
  if (Object.prototype.hasOwnProperty.call(options, 'callbackPayload')) {
    fields.push('callback_payload = ?');
    values.push(options.callbackPayload ? JSON.stringify(options.callbackPayload) : null);
  }

  values.push(payment.payment_id);
  await connection.query(
    `UPDATE payments
     SET ${fields.join(', ')}
     WHERE payment_id = ?`,
    values
  );

  if (finalBookingStatus !== payment.booking_status) {
    await connection.query('UPDATE bookings SET status = ? WHERE booking_id = ?', [
      finalBookingStatus,
      payment.booking_id,
    ]);
  }

  if (status === 'paid' && finalBookingStatus === 'confirmed') {
    await connection.query("UPDATE parking_slots SET status = 'booked' WHERE slot_id = ?", [
      payment.slot_id,
    ]);
    await cancelPendingSelectionsForSlot(connection, payment.slot_id, {
      excludeBookingId: payment.booking_id,
      reason: 'Slot secured by a paid booking.',
    });
  } else {
    await syncSlotStatus(connection, payment.slot_id);
  }

  return {
    found: true,
    paymentId: payment.payment_id,
    bookingId: payment.booking_id,
    slotId: payment.slot_id,
    paymentStatus: finalPaymentStatus,
    bookingStatus: finalBookingStatus,
    reviewMessage,
  };
}

async function resyncAllSlotStatuses(poolOrConnection) {
  const hasPoolInterface = typeof poolOrConnection?.getConnection === 'function';
  const connection = hasPoolInterface ? await poolOrConnection.getConnection() : poolOrConnection;

  try {
    const [rows] = await connection.query('SELECT slot_id FROM parking_slots ORDER BY slot_id');
    for (const row of rows) {
      await syncSlotStatus(connection, row.slot_id);
    }
    return rows.length;
  } finally {
    if (hasPoolInterface && connection) {
      connection.release();
    }
  }
}

function startPendingSelectionExpiryScheduler(poolOrConnection) {
  const intervalMs = Math.max(
    10000,
    Number(process.env.BOOKING_EXPIRY_SCAN_MS || DEFAULT_EXPIRY_SCAN_MS)
  );

  const timer = setInterval(async () => {
    try {
      const result = await expirePendingSelections(poolOrConnection);
      if (result.expiredCount > 0) {
        // eslint-disable-next-line no-console
        console.log(`Expired ${result.expiredCount} unpaid booking selection(s).`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Pending booking expiry scan failed:', err.message);
    }
  }, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return timer;
}

module.exports = {
  applyPaymentOutcome,
  cancelDriverPendingSelections,
  cancelPendingSelectionsForSlot,
  expirePendingSelections,
  getPendingHoldSeconds,
  resyncAllSlotStatuses,
  startPendingSelectionExpiryScheduler,
  syncSlotStatus,
};

