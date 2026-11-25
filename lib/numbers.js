'use strict';

const { db, t, withTx } = require('./db');
const { now, jd, n } = require('./util');

const docs = ['SPH', 'INV', 'KWT', 'SJ', 'BAST', 'GAR', 'TAG'];

function defaultCounters() {
  return { SPH: 17, INV: 1, KWT: 1, SJ: 1, BAST: 1, GAR: 11, TAG: 22 };
}

function docNumber(k, tx, company) {
  const raw = (k === 'TAG' && tx.tagDate)
    ? tx.tagDate
    : (tx.docDate || now().slice(0, 10));

  let d = new Date(String(raw) + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) d = new Date();

  const fmtKey = 'fmt_' + k;
  const fmt = String(company[fmtKey] || company.numFmt || '{no}/{kode}/PTI-{klien}/{bulan}/{tahun}');
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const pad = Math.max(1, Math.min(10, parseInt(company.pad, 10) || 1));
  const seq = parseInt(company.__seq, 10) || 0;

  const tokens = {
    '{tahun4}': String(d.getUTCFullYear()),
    '{tahun}': String(d.getUTCFullYear()).slice(-2),
    '{bulan}': roman[d.getUTCMonth()],
    '{kode}': k,
    '{klien}': String(tx.clientCode || ''),
    '{no}': String(seq).padStart(pad, '0'),
  };
  let out = fmt;
  for (const [key, value] of Object.entries(tokens)) out = out.split(key).join(value);
  return out;
}

async function allocateNumbers(tx, company) {
  return await withTx(async (conn) => {
    const defaults = defaultCounters();
    const nums = {};
    const counters = {};
    for (const k of docs) {
      await conn.execute(
        `INSERT IGNORE INTO ${t('counters')} (doc_type, seq, updated_at) VALUES (?, ?, ?)`,
        [k, defaults[k], now()]
      );
      const [rows] = await conn.execute(
        `SELECT seq FROM ${t('counters')} WHERE doc_type = ? FOR UPDATE`,
        [k]
      );
      const seq = parseInt(rows[0] && rows[0].seq, 10) + 1;
      await conn.execute(
        `UPDATE ${t('counters')} SET seq = ?, updated_at = ? WHERE doc_type = ?`,
        [seq, now(), k]
      );
      company.__seq = seq;
      nums[k] = docNumber(k, tx, company);
      counters[k] = seq;
    }
    return { nums, counters };
  });
}

module.exports = { docs, defaultCounters, docNumber, allocateNumbers };
