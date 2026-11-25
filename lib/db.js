'use strict';

const mysql = require('mysql2/promise');
const cfg = require('./config');
const { jd } = require('./util');

let pool = null;

function db() {
  if (!pool) pool = mysql.createPool(cfg.dbConfig());
  return pool;
}

function t(name) {
  return '`' + cfg.prefix + String(name).replace(/[^a-z0-9_]/gi, '') + '`';
}

async function q(sql, params = []) {
  const [rows] = await db().execute(sql, params);
  return rows;
}

async function qOne(sql, params = []) {
  const rows = await q(sql, params);
  return rows.length ? rows[0] : null;
}

async function exec(sql, params = []) {
  const [res] = await db().execute(sql, params);
  return res;
}

async function withTx(fn) {
  const conn = await db().getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (e) {
    try { await conn.rollback(); } catch (_) { /* abaikan */ }
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { db, t, q, qOne, exec, withTx, jd };
