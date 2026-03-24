const crypto = require('crypto');

function getBaseUrl() {
  const env = process.env.MPESA_ENV === 'production' ? 'production' : 'sandbox';
  return `https://${env === 'production' ? 'api' : 'sandbox'}.safaricom.co.ke`;
}

function getTimestamp() {
  return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
}

function normalizePhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) {
    return `254${digits.slice(1)}`;
  }
  if (digits.startsWith('254')) {
    return digits;
  }
  return digits;
}

function validateConfig() {
  const required = [
    'MPESA_CONSUMER_KEY',
    'MPESA_CONSUMER_SECRET',
    'MPESA_SHORT_CODE',
    'MPESA_PASSKEY',
    'MPESA_CALLBACK_URL',
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing M-Pesa config: ${missing.join(', ')}`);
  }
}

async function getAccessToken() {
  validateConfig();
  const baseURL = getBaseUrl();
  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString('base64');

  const response = await fetch(
    `${baseURL}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`M-Pesa auth failed: ${text}`);
  }
  const data = await response.json();
  return data.access_token;
}

async function stkPush({ amount, phone, accountReference, transactionDesc }) {
  validateConfig();
  const token = await getAccessToken();
  const baseURL = getBaseUrl();
  const timestamp = getTimestamp();
  const shortCode = process.env.MPESA_SHORT_CODE;
  const passKey = process.env.MPESA_PASSKEY;
  const transactionType = process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline';
  const callbackUrl = process.env.MPESA_CALLBACK_URL;

  const password = Buffer.from(`${shortCode}${passKey}${timestamp}`).toString('base64');
  const msisdn = normalizePhone(phone);

  const payload = {
    BusinessShortCode: shortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: transactionType,
    Amount: Number(amount),
    PartyA: msisdn,
    PartyB: shortCode,
    PhoneNumber: msisdn,
    CallBackURL: callbackUrl,
    AccountReference: accountReference,
    TransactionDesc: transactionDesc || 'Parking payment',
  };

  const response = await fetch(`${baseURL}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.errorMessage || data?.errorMessage || response.statusText;
    throw new Error(`M-Pesa STK push failed: ${message}`);
  }
  return data;
}

async function stkQuery(checkoutRequestId) {
  validateConfig();
  const token = await getAccessToken();
  const baseURL = getBaseUrl();
  const timestamp = getTimestamp();
  const shortCode = process.env.MPESA_SHORT_CODE;
  const passKey = process.env.MPESA_PASSKEY;
  const password = Buffer.from(`${shortCode}${passKey}${timestamp}`).toString('base64');

  const payload = {
    BusinessShortCode: shortCode,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  };

  const response = await fetch(`${baseURL}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`M-Pesa query failed: ${response.statusText}`);
  }
  return data;
}

function generateReference() {
  return `PM-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
}

module.exports = {
  getBaseUrl,
  normalizePhone,
  stkPush,
  stkQuery,
  generateReference,
};
