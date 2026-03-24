/* eslint-disable no-console */
require('dotenv').config();

const API_BASE = process.env.API_BASE || 'http://localhost:4000';

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || `Request failed: ${response.status}`);
  }
  return data;
}

async function run() {
  const email = `mpesa_${Date.now()}@park.local`;
  const password = 'Driver@123';

  await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'M-Pesa Driver',
      email,
      phone: '0712345679',
      vehicle_number: 'KMP 111X',
      password,
    }),
  });

  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  const token = login.token;
  const authHeaders = { Authorization: `Bearer ${token}` };

  const slots = await api('/api/driver/slots', { headers: authHeaders });
  const slot = slots[0];
  if (!slot) {
    throw new Error('No available slot to book.');
  }

  const start = new Date();
  const end = new Date(Date.now() + 60 * 60 * 1000);
  const booking = await api('/api/driver/bookings', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      slot_id: slot.slot_id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      payment_method: 'mobile_money',
    }),
  });

  const payment = await api('/api/driver/payments/initiate', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      booking_id: booking.booking_id,
      provider: 'M-Pesa',
      phone: process.env.MPESA_TEST_PHONE || '0712345679',
    }),
  });

  console.log('M-Pesa STK Push initiated.');
  console.log({
    email,
    booking,
    payment,
  });
  console.log('Wait for Daraja callback to confirm payment status.');
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
