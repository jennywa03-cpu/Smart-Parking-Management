const mysql = require('mysql2/promise');
const { getDatabaseConfig } = require('./databaseConfig');

const databaseConfig = getDatabaseConfig();

const pool = mysql.createPool({
  host: databaseConfig.host,
  user: databaseConfig.user,
  password: databaseConfig.password,
  database: databaseConfig.database,
  port: Number(databaseConfig.port),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;
