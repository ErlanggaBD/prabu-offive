'use strict';

function env(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === null ? fallback : String(v);
}

module.exports = {
  host: env('TIDB_HOST'),
  port: parseInt(env('TIDB_PORT', '4000'), 10) || 4000,
  user: env('TIDB_USER'),
  password: env('TIDB_PASSWORD'),
  name: env('TIDB_NAME'),
  prefix: env('DB_PREFIX', 'prabu_'),
  waNumber: env('WA_NUMBER', '6282246838645'),
  tz: env('TZ', 'Asia/Jakarta'),
  blobToken: env('BLOB_READ_WRITE_TOKEN'),
  adminUser: env('ADMIN_USER', 'admin'),
  adminPass: env('ADMIN_PASS', ''),
};

function dbConfig() {
  const ca = process.env.TIDB_CA
    ? String(process.env.TIDB_CA).replace(/\\n/g, '\n')
    : '';
  return {
    host: module.exports.host,
    port: module.exports.port,
    user: module.exports.user,
    password: module.exports.password,
    database: module.exports.name,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 3,
    maxIdle: 2,
    idleTimeout: 10000,
    ssl: ca ? { ca } : { rejectUnauthorized: false },
  };
}

module.exports.dbConfig = dbConfig;
