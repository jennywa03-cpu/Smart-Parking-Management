/* eslint-disable no-console */
require('dotenv').config();
const mysql = require('mysql2/promise');

const API_BASE = process.env.API_BASE || 'http://localhost:4000';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || process.env.ADMIN_SEED_EMAIL;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || process.env.ADMIN_SEED_PASSWORD;
const ATTENDANT_EMAIL = process.env.SMOKE_ATTENDANT_EMAIL || `automation.attendant.${Date.now()}@example.invalid`; 
const ATTENDANT_PASSWORD = process.env.SMOKE_ATTENDANT_PASSWORD || 'Attendant@123';

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const config = { ...options, headers };
  const response = await fetch(`${API_BASE}${path}`, config);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = data?.errors ? JSON.stringify(data.errors) : data?.message;
    throw new Error(`${path} failed: ${details || response.status}`);
  }
  return data;
}

async function login(email, password) {
  return api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

async function getDbConnection() {
  return mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'Park_db',
    port: Number(process.env.DB_PORT || 3306),
  });
}

async function ensureAttendant(adminToken) {
  try {
    const loginResponse = await login(ATTENDANT_EMAIL, ATTENDANT_PASSWORD);
    return loginResponse.token;
  } catch (err) {
    const users = await api('/api/admin/users', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const existing = users.find((user) => user.email === ATTENDANT_EMAIL);
    if (!existing) {
      await api('/api/admin/users', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          name: 'Automation Attendant',
          email: ATTENDANT_EMAIL,
          user_type: 'attendant',
          password: ATTENDANT_PASSWORD,
        }),
      });
    }
    const loginResponse = await login(ATTENDANT_EMAIL, ATTENDANT_PASSWORD);
    return loginResponse.token;
  }
}

async function ensureAvailableSlots(adminToken, minimum) {
  const slots = await api('/api/admin/slots', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const available = slots.filter((slot) => slot.status === 'available');

  for (let i = available.length; i < minimum; i += 1) {
    await api('/api/admin/slots', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        slot_number: `CHK-${Date.now()}-${i}`,
        location: 'Verification Zone',
        hourly_rate: 100,
      }),
    });
  }

  const refreshed = await api('/api/admin/slots', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  return refreshed.filter((slot) => slot.status === 'available').slice(0, minimum);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertPublicCode(value, prefix, message) {
  const pattern = new RegExp(`^${prefix}-[A-Z0-9]{6,}$`);
  assert(pattern.test(String(value || '')), message);
}

async function backdateBooking(connection, bookingId, secondsAgo) {
  await connection.query(
    'UPDATE bookings SET created_at = DATE_SUB(NOW(), INTERVAL ? SECOND) WHERE booking_id = ?',
    [secondsAgo, bookingId]
  );
}

async function run() {
  console.log('Running API smoke tests...');

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD, or provide SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD.');
  }

  await api('/health');
  await api('/health/db');

  const adminLogin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const adminToken = adminLogin.token;
  assert(adminToken, 'Admin login failed');
  assertPublicCode(adminLogin.user?.user_code, 'USR', 'Admin login should return an alphanumeric user code');

  const attendantToken = await ensureAttendant(adminToken);
  assert(attendantToken, 'Attendant login failed');

  const [slotA, slotB] = await ensureAvailableSlots(adminToken, 2);
  assert(slotA && slotB, 'Not enough available slots for smoke test');
  assertPublicCode(slotA.slot_code, 'SLT', 'Available slots should expose alphanumeric slot codes');
  assertPublicCode(slotB.slot_code, 'SLT', 'Available slots should expose alphanumeric slot codes');

  const stamp = Date.now();
  const driverEmail = `automation_${stamp}@example.invalid`;
  const driverPassword = 'Driver@123';
  const vehicleNumber = `KSM ${String(stamp).slice(-4)}X`;

  await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Automation Driver',
      email: driverEmail,
      phone: '0712345678',
      vehicle_number: vehicleNumber,
      password: driverPassword,
    }),
  });

  const driverLogin = await login(driverEmail, driverPassword);
  const driverToken = driverLogin.token;
  assert(driverToken, 'Driver login failed');
  assertPublicCode(driverLogin.user?.user_code, 'USR', 'Driver login should return an alphanumeric user code');

  const adminUsers = await api('/api/admin/users', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const createdDriver = adminUsers.find((user) => user.email === driverEmail);
  assert(createdDriver, 'New driver should appear in admin users');
  assertPublicCode(createdDriver.user_code, 'USR', 'Admin users should expose alphanumeric user codes');

  await api(`/api/admin/users/${createdDriver.user_code}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'active' }),
  });

  await api(`/api/admin/slots/${slotA.slot_code}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ location: slotA.location || 'Verification Zone' }),
  });

  await api(`/api/admin/slots/${slotA.slot_code}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'available' }),
  });

  const start = new Date();
  const end = new Date(Date.now() + 60 * 60 * 1000);

  const firstSelection = await api('/api/driver/bookings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({
      slot_id: slotA.slot_id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      payment_method: 'mobile_money',
    }),
  });

  assert(firstSelection.booking_status === 'pending', 'First mobile selection should stay pending');
  assert(firstSelection.slot_locked === false, 'Unpaid mobile selection should not lock the slot');

  const afterFirstSlots = await api('/api/driver/slots', {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  assert(
    afterFirstSlots.some((slot) => slot.slot_id === slotA.slot_id),
    'Unpaid slot should still be visible after first selection'
  );
  assertPublicCode(afterFirstSlots[0]?.slot_code || slotA.slot_code, 'SLT', 'Driver slot list should expose alphanumeric slot codes');

  const secondSelection = await api('/api/driver/bookings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({
      slot_id: slotB.slot_id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      payment_method: 'mobile_money',
    }),
  });

  assert(secondSelection.booking_status === 'pending', 'Second mobile selection should stay pending');
  assert(
    Number(secondSelection.released_unpaid_bookings || 0) >= 1,
    'Older unpaid selection should be auto-cancelled when a new one is created'
  );

  const bookingsAfterSwap = await api('/api/driver/bookings', {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  const firstBooking = bookingsAfterSwap.find((booking) => booking.booking_id === firstSelection.booking_id);
  const secondBooking = bookingsAfterSwap.find((booking) => booking.booking_id === secondSelection.booking_id);
  assert(firstBooking?.booking_status === 'cancelled', 'First selection should be cancelled after switching slots');
  assert(secondBooking?.booking_status === 'pending', 'Newest selection should remain pending before payment');
  assertPublicCode(secondBooking?.slot_code || slotB.slot_code, 'SLT', 'Driver bookings should expose alphanumeric slot codes');

  const db = await getDbConnection();
  const expirySeconds = Number(process.env.BOOKING_HOLD_SECONDS || 120) + 10;
  await backdateBooking(db, secondSelection.booking_id, expirySeconds);
  await db.end();

  const bookingsAfterExpiry = await api('/api/driver/bookings', {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  const expiredBooking = bookingsAfterExpiry.find((booking) => booking.booking_id === secondSelection.booking_id);
  assert(expiredBooking?.booking_status === 'cancelled', 'Pending selection should auto-cancel after the hold window expires');

  const visibleSlotsAfterExpiry = await api('/api/driver/slots', {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  assert(
    visibleSlotsAfterExpiry.some((slot) => slot.slot_id === slotB.slot_id),
    'Expired slot should return to the public available list'
  );

  const thirdSelection = await api('/api/driver/bookings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${driverToken}` },
    body: JSON.stringify({
      slot_id: slotB.slot_id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      payment_method: 'mobile_money',
    }),
  });

  const paymentConfirmation = await api(`/api/admin/payments/${thirdSelection.payment_id}/status`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      status: 'paid',
      note: 'Verification payment confirmation',
    }),
  });
  assert(paymentConfirmation.payment_status === 'paid', 'Admin payment confirmation should mark payment as paid');
  assert(paymentConfirmation.booking_status === 'confirmed', 'Paid selection should become confirmed');

  const bookingsAfterPayment = await api('/api/driver/bookings', {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  const paidBooking = bookingsAfterPayment.find((booking) => booking.booking_id === thirdSelection.booking_id);
  assert(paidBooking?.booking_status === 'confirmed', 'Paid booking should be confirmed in booking list');
  assert(paidBooking?.payment_status === 'paid', 'Paid booking should show paid payment status');
  assertPublicCode(paidBooking?.slot_code, 'SLT', 'Paid booking should still expose the public slot code');

  const filteredByCodes = await api(`/api/admin/bookings?user_id=${encodeURIComponent(createdDriver.user_code)}&slot_id=${encodeURIComponent(slotB.slot_code)}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(filteredByCodes.some((booking) => booking.booking_id === thirdSelection.booking_id), 'Admin booking filters should accept public user and slot codes');

  const visibleSlotsAfterPayment = await api('/api/driver/slots', {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  const paidSlot = visibleSlotsAfterPayment.find((slot) => slot.slot_id === slotB.slot_id);
  assert(paidSlot, 'Paid slot should remain visible on the lot map');
  assert(paidSlot.status === 'booked', 'Paid slot should show as booked on the lot map');

  const entry = await api('/api/attendant/entry', {
    method: 'POST',
    headers: { Authorization: `Bearer ${attendantToken}` },
    body: JSON.stringify({
      vehicle_number: vehicleNumber,
      slot_id: slotB.slot_id,
      booking_id: thirdSelection.booking_id,
    }),
  });
  assert(entry.booking_id === thirdSelection.booking_id, 'Attendant entry should use the confirmed booking');

  const activeEntry = await api(`/api/attendant/entries/active?vehicle_number=${encodeURIComponent(vehicleNumber)}`, {
    headers: { Authorization: `Bearer ${attendantToken}` },
  });
  assert(activeEntry.slot_id === slotB.slot_id, 'Active entry lookup should return the booked slot');
  assertPublicCode(activeEntry.slot_code, 'SLT', 'Attendant active entry lookup should expose the public slot code');

  const exit = await api('/api/attendant/exit', {
    method: 'POST',
    headers: { Authorization: `Bearer ${attendantToken}` },
    body: JSON.stringify({ vehicle_number: vehicleNumber }),
  });
  assert(Number(exit.total_cost) >= 0, 'Exit should calculate a parking total');

  const reopenedSlots = await api('/api/driver/slots', {
    headers: { Authorization: `Bearer ${driverToken}` },
  });
  assert(
    reopenedSlots.some((slot) => slot.slot_id === slotB.slot_id),
    'Completed parking slot should become available again after exit'
  );

  await api('/api/admin/reports/summary', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  console.log('Smoke tests passed.');
}

run().catch((err) => {
  console.error('Smoke tests failed:', err.message);
  process.exit(1);
});


