function firstNonEmpty(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
}

function parseDatabaseUrl(rawUrl) {
  if (!rawUrl) {
    return null;
  }

  const url = new URL(rawUrl);
  const protocol = (url.protocol || '').replace(':', '').toLowerCase();
  if (!['mysql', 'mysql2'].includes(protocol)) {
    throw new Error(`Unsupported database URL protocol: ${url.protocol}`);
  }

  return {
    host: url.hostname,
    user: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    database: decodeURIComponent(url.pathname.replace(/^\//, '') || ''),
    port: Number(url.port || 3306),
  };
}

function getDatabaseConfig() {
  const databaseUrl = firstNonEmpty(
    process.env.DATABASE_URL,
    process.env.MYSQL_URL,
    process.env.DATABASE_PRIVATE_URL,
    process.env.MYSQL_PRIVATE_URL
  );

  if (databaseUrl) {
    const parsed = parseDatabaseUrl(databaseUrl);
    return {
      ...parsed,
      source: 'url',
      urlEnv: databaseUrl,
    };
  }

  return {
    host: firstNonEmpty(process.env.DB_HOST, process.env.MYSQLHOST, 'localhost'),
    user: firstNonEmpty(process.env.DB_USER, process.env.MYSQLUSER, 'root'),
    password: firstNonEmpty(process.env.DB_PASSWORD, process.env.MYSQLPASSWORD, ''),
    database: firstNonEmpty(process.env.DB_NAME, process.env.MYSQLDATABASE, 'Park_db'),
    port: Number(firstNonEmpty(process.env.DB_PORT, process.env.MYSQLPORT, 3306)),
    source: 'discrete',
  };
}

function getDatabaseConfigSummary(config = getDatabaseConfig()) {
  return {
    source: config.source,
    host: config.host,
    port: config.port,
    user: config.user,
    database: config.database,
    hasPassword: Boolean(config.password),
    hasUrl: Boolean(config.urlEnv),
    envHints: {
      DB_HOST: Boolean(process.env.DB_HOST),
      DB_USER: Boolean(process.env.DB_USER),
      DB_NAME: Boolean(process.env.DB_NAME),
      MYSQLHOST: Boolean(process.env.MYSQLHOST),
      MYSQLUSER: Boolean(process.env.MYSQLUSER),
      MYSQLDATABASE: Boolean(process.env.MYSQLDATABASE),
      MYSQL_URL: Boolean(process.env.MYSQL_URL),
      DATABASE_URL: Boolean(process.env.DATABASE_URL),
      DATABASE_PRIVATE_URL: Boolean(process.env.DATABASE_PRIVATE_URL),
      MYSQL_PRIVATE_URL: Boolean(process.env.MYSQL_PRIVATE_URL),
    },
  };
}

module.exports = {
  getDatabaseConfig,
  getDatabaseConfigSummary,
};
