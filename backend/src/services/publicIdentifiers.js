const crypto = require('crypto');

const USER_PREFIX = 'USR';
const SLOT_PREFIX = 'SLT';
const SEGMENT_LENGTH = 8;

function normalizePublicId(value) {
  return String(value || '').trim().toUpperCase();
}

function isNumericIdentifier(value) {
  return /^\d+$/.test(String(value || '').trim());
}

function createRandomSegment(length = SEGMENT_LENGTH) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let output = '';
  for (let index = 0; index < length; index += 1) {
    output += alphabet[bytes[index] % alphabet.length];
  }
  return output;
}

function buildPublicId(prefix) {
  return `${prefix}-${createRandomSegment()}`;
}

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

async function indexExists(connection, tableName, indexName) {
  const [rows] = await connection.query(
    `SELECT 1
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      LIMIT 1`,
    [tableName, indexName]
  );
  return rows.length > 0;
}

async function ensureColumn(connection, tableName, columnName, definition) {
  if (await columnExists(connection, tableName, columnName)) {
    return;
  }
  await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
}

async function ensureUniqueIndex(connection, tableName, indexName, columnName) {
  if (await indexExists(connection, tableName, indexName)) {
    return;
  }
  await connection.query(
    `ALTER TABLE \`${tableName}\` ADD UNIQUE INDEX \`${indexName}\` (\`${columnName}\`)`
  );
}

async function generateUniquePublicId(connection, tableName, columnName, prefix) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = buildPublicId(prefix);
    const [rows] = await connection.query(
      `SELECT 1 FROM \`${tableName}\` WHERE \`${columnName}\` = ? LIMIT 1`,
      [candidate]
    );
    if (!rows.length) {
      return candidate;
    }
  }
  throw new Error(`Unable to generate unique public identifier for ${tableName}.${columnName}`);
}

async function backfillPublicIds(connection, tableName, keyColumn, publicColumn, prefix) {
  const [rows] = await connection.query(
    `SELECT \`${keyColumn}\` AS id
       FROM \`${tableName}\`
      WHERE \`${publicColumn}\` IS NULL OR \`${publicColumn}\` = ''`
  );

  for (const row of rows) {
    const publicId = await generateUniquePublicId(connection, tableName, publicColumn, prefix);
    await connection.query(
      `UPDATE \`${tableName}\` SET \`${publicColumn}\` = ? WHERE \`${keyColumn}\` = ?`,
      [publicId, row.id]
    );
  }

  const [[remaining]] = await connection.query(
    `SELECT COUNT(*) AS total
       FROM \`${tableName}\`
      WHERE \`${publicColumn}\` IS NULL OR \`${publicColumn}\` = ''`
  );

  if (remaining.total === 0) {
    await connection.query(
      `ALTER TABLE \`${tableName}\` MODIFY \`${publicColumn}\` VARCHAR(24) NOT NULL`
    );
  }
}

async function ensurePublicIdentifiers(poolOrConnection) {
  const connection = typeof poolOrConnection.getConnection === 'function'
    ? await poolOrConnection.getConnection()
    : poolOrConnection;
  const shouldRelease = typeof poolOrConnection.getConnection === 'function';

  try {
    await ensureColumn(connection, 'users', 'public_user_id', 'VARCHAR(24) NULL AFTER user_id');
    await ensureColumn(connection, 'parking_slots', 'public_slot_id', 'VARCHAR(24) NULL AFTER slot_id');
    await backfillPublicIds(connection, 'users', 'user_id', 'public_user_id', USER_PREFIX);
    await backfillPublicIds(connection, 'parking_slots', 'slot_id', 'public_slot_id', SLOT_PREFIX);
    await ensureUniqueIndex(connection, 'users', 'idx_users_public_user_id', 'public_user_id');
    await ensureUniqueIndex(connection, 'parking_slots', 'idx_parking_slots_public_slot_id', 'public_slot_id');
  } finally {
    if (shouldRelease) {
      connection.release();
    }
  }
}

async function resolveUserIdentifier(connection, rawValue) {
  const value = normalizePublicId(rawValue);
  if (!value) return null;

  const [rows] = await connection.query(
    `SELECT user_id, public_user_id
       FROM users
      WHERE public_user_id = ? OR user_id = ?
      LIMIT 1`,
    [value, isNumericIdentifier(value) ? Number(value) : 0]
  );
  return rows[0] || null;
}

async function resolveSlotIdentifier(connection, rawValue) {
  const value = normalizePublicId(rawValue);
  if (!value) return null;

  const [rows] = await connection.query(
    `SELECT slot_id, public_slot_id
       FROM parking_slots
      WHERE public_slot_id = ? OR slot_id = ?
      LIMIT 1`,
    [value, isNumericIdentifier(value) ? Number(value) : 0]
  );
  return rows[0] || null;
}

module.exports = {
  USER_PREFIX,
  SLOT_PREFIX,
  normalizePublicId,
  generateUniquePublicId,
  ensurePublicIdentifiers,
  resolveUserIdentifier,
  resolveSlotIdentifier,
};
