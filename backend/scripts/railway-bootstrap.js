require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getDatabaseConfig, getDatabaseConfigSummary } = require('../src/config/databaseConfig');

const IGNORABLE_ERRORS = new Set([1050, 1060, 1061, 1826]);
const MAX_RETRIES = Number(process.env.RAILWAY_BOOTSTRAP_RETRIES || 20);
const RETRY_DELAY_MS = Number(process.env.RAILWAY_BOOTSTRAP_RETRY_MS || 3000);

function sanitizeSql(sql) {
  return sql
    .replace(/^\s*CREATE DATABASE IF NOT EXISTS .*?;\s*/gim, '')
    .replace(/^\s*USE\s+.*?;\s*/gim, '')
    .trim();
}

function splitStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function formatError(err) {
  return {
    message: err?.message || String(err),
    code: err?.code || null,
    errno: err?.errno || null,
    address: err?.address || null,
    port: err?.port || null,
  };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry() {
  const config = getDatabaseConfig();
  const summary = getDatabaseConfigSummary(config);

  if (!summary.hasUrl && !summary.envHints.DB_HOST && !summary.envHints.MYSQLHOST) {
    throw new Error(
      'No database connection settings found. On Railway, add reference variables from the MySQL service (MYSQLHOST/MYSQLUSER/MYSQLPASSWORD/MYSQLDATABASE or MYSQL_URL) to the app service.'
    );
  }

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      // eslint-disable-next-line no-console
      console.log(`Bootstrap DB connection attempt ${attempt}/${MAX_RETRIES}`, summary);
      return await mysql.createConnection({
        host: config.host,
        user: config.user,
        password: config.password,
        database: config.database,
        port: Number(config.port),
      });
    } catch (err) {
      lastError = err;
      const details = formatError(err);
      // eslint-disable-next-line no-console
      console.error('Database connection attempt failed:', details);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError;
}

async function runSqlFile(connection, filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  const sql = sanitizeSql(original);
  if (!sql) {
    return;
  }

  for (const statement of splitStatements(sql)) {
    try {
      await connection.query(statement);
    } catch (err) {
      if (IGNORABLE_ERRORS.has(err.errno)) {
        continue;
      }
      throw err;
    }
  }
}

async function main() {
  const connection = await connectWithRetry();
  try {
    const schemaPath = path.resolve(__dirname, '..', '..', 'database', 'schema.sql');
    const seedPath = path.resolve(__dirname, '..', '..', 'database', 'seed.sql');
    const migrationsDir = path.resolve(__dirname, '..', '..', 'database', 'migrations');

    await runSqlFile(connection, schemaPath);
    await runSqlFile(connection, seedPath);

    if (fs.existsSync(migrationsDir)) {
      const migrations = fs.readdirSync(migrationsDir)
        .filter((file) => file.endsWith('.sql'))
        .sort();

      for (const migration of migrations) {
        await runSqlFile(connection, path.join(migrationsDir, migration));
      }
    }

    // eslint-disable-next-line no-console
    console.log('Railway database bootstrap completed successfully.');
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Railway database bootstrap failed:', formatError(err));
  if (err?.stack) {
    // eslint-disable-next-line no-console
    console.error(err.stack);
  }
  process.exit(1);
});
