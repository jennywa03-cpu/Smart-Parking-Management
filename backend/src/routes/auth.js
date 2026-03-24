const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body } = require('express-validator');
const pool = require('../config/db');
const validate = require('../middleware/validate');
const { signToken } = require('../middleware/auth');
const { checkPasswordStrength } = require('../utils/password');
const { sendPasswordResetEmail, sendPasswordResetSms } = require('../services/notifications');
const { USER_PREFIX, generateUniquePublicId } = require('../services/publicIdentifiers');

const router = express.Router();

router.post(
  '/register',
  [
    body('name').trim().isLength({ min: 2, max: 120 }),
    body('email').isEmail().normalizeEmail(),
    body('phone').optional().isLength({ min: 6, max: 40 }),
    body('vehicle_number').optional().isLength({ min: 3, max: 60 }),
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
      const { name, email, phone, vehicle_number, password } = req.body;

      const [existing] = await pool.query(
        'SELECT user_id FROM users WHERE email = ? LIMIT 1',
        [email]
      );
      if (existing.length) {
        return res.status(409).json({ message: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const publicUserId = await generateUniquePublicId(pool, 'users', 'public_user_id', USER_PREFIX);
      const [result] = await pool.query(
        `INSERT INTO users (public_user_id, name, email, phone, password_hash, user_type, vehicle_number)
         VALUES (?, ?, ?, ?, ?, 'driver', ?)`,
        [publicUserId, name, email, phone || null, passwordHash, vehicle_number || null]
      );

      return res.status(201).json({ user_id: result.insertId, user_code: publicUserId });
    } catch (err) {
      return next(err);
    }
  }
);

router.post(
  '/login',
  [body('email').isEmail(), body('password').isLength({ min: 8, max: 120 })],
  validate,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const [rows] = await pool.query(
        `SELECT user_id, public_user_id, name, email, password_hash, user_type, status,
                failed_login_attempts, lock_until
         FROM users WHERE email = ? LIMIT 1`,
        [email]
      );
      if (!rows.length) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      const user = rows[0];
      if (user.status !== 'active') {
        return res.status(403).json({ message: 'Account inactive' });
      }

      if (user.lock_until && new Date(user.lock_until).getTime() > Date.now()) {
        return res.status(423).json({
          message: 'Account locked. Try again later.',
          lock_until: user.lock_until,
        });
      }

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) {
        const threshold = Number(process.env.LOCKOUT_THRESHOLD || 5);
        const lockMinutes = Number(process.env.LOCKOUT_MINUTES || 15);
        const nextAttempts = (user.failed_login_attempts || 0) + 1;
        let lockUntil = null;
        if (nextAttempts >= threshold) {
          lockUntil = new Date(Date.now() + lockMinutes * 60 * 1000);
        }
        await pool.query(
          'UPDATE users SET failed_login_attempts = ?, lock_until = ? WHERE user_id = ?',
          [lockUntil ? 0 : nextAttempts, lockUntil, user.user_id]
        );
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      if (user.failed_login_attempts || user.lock_until) {
        await pool.query(
          'UPDATE users SET failed_login_attempts = 0, lock_until = NULL WHERE user_id = ?',
          [user.user_id]
        );
      }

      const token = signToken({ id: user.user_id, role: user.user_type });
      res.cookie('token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });

      return res.json({
        token,
        user: {
          user_id: user.user_id,
          user_code: user.public_user_id,
          name: user.name,
          email: user.email,
          role: user.user_type,
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

router.post(
  '/forgot-password',
  [body('email').isEmail().normalizeEmail()],
  validate,
  async (req, res, next) => {
    try {
      const { email } = req.body;
      const [rows] = await pool.query(
        'SELECT user_id, status, name, phone FROM users WHERE email = ? LIMIT 1',
        [email]
      );

      if (!rows.length || rows[0].status !== 'active') {
        return res.json({
          message: 'If the email exists, a reset code has been sent.',
        });
      }

      const userId = rows[0].user_id;
      await pool.query(
        'UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
        [userId]
      );

      const token = crypto.randomBytes(24).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      await pool.query(
        'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
        [userId, tokenHash, expiresAt]
      );

      try {
        await sendPasswordResetEmail({
          to: email,
          name: rows[0].name,
          token,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to send reset email:', err.message);
      }

      if (rows[0].phone) {
        try {
          await sendPasswordResetSms({
            to: rows[0].phone,
            token,
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Failed to send reset SMS:', err.message);
        }
      }

      const response = {
        message: 'If the email exists, a reset code has been sent.',
      };

      if (process.env.SHOW_RESET_TOKEN === 'true') {
        response.reset_token = token;
      }

      return res.json(response);
    } catch (err) {
      return next(err);
    }
  }
);

router.post(
  '/reset-password',
  [
    body('token').trim().isLength({ min: 6, max: 200 }),
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
      const { token, password } = req.body;
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const [rows] = await pool.query(
        `SELECT reset_id, user_id, expires_at
         FROM password_resets
         WHERE token_hash = ? AND used_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [tokenHash]
      );

      if (!rows.length) {
        return res.status(400).json({ message: 'Invalid or expired reset token' });
      }

      const reset = rows[0];
      if (new Date(reset.expires_at).getTime() < Date.now()) {
        await pool.query('UPDATE password_resets SET used_at = NOW() WHERE reset_id = ?', [
          reset.reset_id,
        ]);
        return res.status(400).json({ message: 'Reset token expired' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      await pool.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [
        passwordHash,
        reset.user_id,
      ]);
      await pool.query('UPDATE password_resets SET used_at = NOW() WHERE reset_id = ?', [
        reset.reset_id,
      ]);

      return res.json({ message: 'Password reset successful.' });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;


