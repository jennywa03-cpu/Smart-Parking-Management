require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const pool = require('./config/db');

const authRoutes = require('./routes/auth');
const driverRoutes = require('./routes/driver');
const attendantRoutes = require('./routes/attendant');
const adminRoutes = require('./routes/admin');
const paymentsRoutes = require('./routes/payments');
const usersRoutes = require('./routes/users');
const { startReportScheduler } = require('./services/reportScheduler');
const { ensurePublicIdentifiers } = require('./services/publicIdentifiers');
const { ensureAdminSeed } = require('./services/adminSeed');
const {
  expirePendingSelections,
  resyncAllSlotStatuses,
  startPendingSelectionExpiryScheduler,
} = require('./services/bookingLifecycle');

const app = express();

const trustProxySetting = String(process.env.TRUST_PROXY || '').trim();
if (trustProxySetting) {
  const normalizedTrustProxy = trustProxySetting.toLowerCase();
  if (normalizedTrustProxy === 'true') {
    app.set('trust proxy', true);
  } else if (normalizedTrustProxy === 'false') {
    app.set('trust proxy', false);
  } else if (!Number.isNaN(Number(trustProxySetting))) {
    app.set('trust proxy', Number(trustProxySetting));
  } else {
    app.set('trust proxy', trustProxySetting);
  }
} else if (
  process.env.RAILWAY_ENVIRONMENT ||
  process.env.RAILWAY_PROJECT_ID ||
  process.env.RAILWAY_PUBLIC_DOMAIN ||
  process.env.RAILWAY_STATIC_URL
) {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');
app.use(helmet());
app.use(
  express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(cookieParser());

const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:4000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowAllOrigins = process.env.CORS_ALLOW_ALL === 'true';

app.use(
  cors({
    origin: (origin, callback) => {
      if (allowAllOrigins) return callback(null, true);
      if (!origin) return callback(null, true);
      if (corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/health/db', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    connection.release();
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/attendant', attendantRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/users', usersRoutes);

const frontendDir = path.resolve(__dirname, '..', '..', 'frontend');
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
}

app.use((err, req, res, next) => {
  // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  res.status(status).json({
    message: err.message || 'Server error',
  });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on port ${port}`);
});

startReportScheduler();
startPendingSelectionExpiryScheduler(pool);
expirePendingSelections(pool).catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Initial pending booking cleanup failed:', err.message);
});

pool
  .getConnection()
  .then(async (connection) => {
    connection.release();
    // eslint-disable-next-line no-console
    console.log('Database connection established');
    try {
      await ensurePublicIdentifiers(pool);
      // eslint-disable-next-line no-console
      console.log('Public user and slot IDs ensured');

      const adminSeed = await ensureAdminSeed(pool);
      if (adminSeed.skipped) {
        // eslint-disable-next-line no-console
        console.log('Admin seed skipped: set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD in environment variables');
      } else {
        // eslint-disable-next-line no-console
        console.log(`Admin seed ${adminSeed.created ? 'created' : 'verified'} for ${adminSeed.email}`);
      }

      const slotCount = await resyncAllSlotStatuses(pool);
      // eslint-disable-next-line no-console
      console.log(`Slot status resync complete for ${slotCount} slots`);
    } catch (syncErr) {
      // eslint-disable-next-line no-console
      console.error('Startup sync failed:', syncErr.message);
    }
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Database connection failed:', err.message);
  });
