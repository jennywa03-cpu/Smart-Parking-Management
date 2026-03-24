require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const IGNORABLE_ERRORS = new Set([1050, 1060, 1061, 1826]);

function readEnv(name, fallback) {
  return process.env[name] || fallback;
}

function createConfig() {
  return {
    host: readEnv('DB_HOST', readEnv('MYSQLHOST', 'localhost')),
    user: readEnv('DB_USER', readEnv('MYSQLUSER', 'root')),
    password: readEnv('DB_PASSWORD', readEnv('MYSQLPASSWORD', '')),
    database: readEnv('DB_NAME', readEnv('MYSQLDATABASE', 'Park_db')),
    port: Number(readEnv('DB_PORT', readEnv('MYSQLPORT', 3306))),
  };
}

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
  const connection = await mysql.createConnection(createConfig());
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
  console.error('Railway database bootstrap failed:', err.message);
  process.exit(1);
});
