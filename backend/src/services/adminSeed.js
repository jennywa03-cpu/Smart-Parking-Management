const bcrypt = require('bcryptjs');
const { USER_PREFIX, generateUniquePublicId } = require('./publicIdentifiers');

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function ensurePasswordColumns(connection) {
  if (!(await columnExists(connection, 'users', 'must_change_password'))) {
    await connection.query(
      'ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER status'
    );
  }

  if (!(await columnExists(connection, 'users', 'password_changed_at'))) {
    await connection.query(
      'ALTER TABLE users ADD COLUMN password_changed_at DATETIME DEFAULT NULL AFTER must_change_password'
    );
  }
}

function getAdminSeedConfig() {
  return {
    name: String(process.env.ADMIN_SEED_NAME || 'System Administrator').trim() || 'System Administrator',
    email: String(process.env.ADMIN_SEED_EMAIL || '').trim().toLowerCase(),
    password: String(process.env.ADMIN_SEED_PASSWORD || ''),
    forcePasswordChange: process.env.ADMIN_SEED_FORCE_PASSWORD_CHANGE !== 'false',
  };
}

async function ensureAdminSeed(poolOrConnection) {
  const config = getAdminSeedConfig();
  if (!config.email || !config.password) {
    return { skipped: true, reason: 'missing_admin_seed_credentials' };
  }

  const connection = typeof poolOrConnection.getConnection === 'function'
    ? await poolOrConnection.getConnection()
    : poolOrConnection;
  const shouldRelease = typeof poolOrConnection.getConnection === 'function';

  try {
    await ensurePasswordColumns(connection);

    const [rows] = await connection.query(
      `SELECT user_id, public_user_id, user_type, status, must_change_password, password_changed_at
         FROM users
        WHERE email = ?
        LIMIT 1`,
      [config.email]
    );

    const existing = rows[0] || null;
    const shouldSyncPassword = !existing
      || existing.must_change_password === 1
      || !existing.password_changed_at;

    if (existing) {
      const updates = ['name = ?', "user_type = 'admin'", "status = 'active'"];
      const values = [config.name];

      if (shouldSyncPassword) {
        const passwordHash = await bcrypt.hash(config.password, 10);
        updates.push(
          'password_hash = ?',
          'must_change_password = ?',
          'password_changed_at = NULL',
          'failed_login_attempts = 0',
          'lock_until = NULL'
        );
        values.push(passwordHash, config.forcePasswordChange ? 1 : 0);
      }

      values.push(existing.user_id);
      await connection.query(`UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`, values);

      return {
        skipped: false,
        created: false,
        updated: true,
        email: config.email,
        forcedChange: shouldSyncPassword && config.forcePasswordChange,
      };
    }

    const publicUserId = await generateUniquePublicId(connection, 'users', 'public_user_id', USER_PREFIX);
    const passwordHash = await bcrypt.hash(config.password, 10);
    await connection.query(
      `INSERT INTO users
        (public_user_id, name, email, password_hash, user_type, status, must_change_password, password_changed_at)
       VALUES (?, ?, ?, ?, 'admin', 'active', ?, NULL)`,
      [publicUserId, config.name, config.email, passwordHash, config.forcePasswordChange ? 1 : 0]
    );

    return {
      skipped: false,
      created: true,
      updated: false,
      email: config.email,
      forcedChange: config.forcePasswordChange,
    };
  } finally {
    if (shouldRelease) {
      connection.release();
    }
  }
}

module.exports = {
  ensureAdminSeed,
  getAdminSeedConfig,
};
