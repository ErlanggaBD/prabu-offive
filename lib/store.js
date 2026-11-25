'use strict';

const { db, t, q, qOne, withTx } = require('./db');
const { j, jd, n, iso, now } = require('./util');
const cfg = require('./config');
const { defaultCounters } = require('./numbers');

async function upsertRow(table, rows, conn = null) {
  const list = Array.isArray(rows) ? rows : [rows];
  if (!list.length || !list[0]) return 0;
  const cols = Object.keys(list[0]);
  if (!cols.length) return 0;
  const quoted = cols.map((c) => '`' + c.replace(/[^a-z0-9_]/gi, '') + '`').join(',');
  const ph = cols.map(() => '?').join(',');
  const sets = cols
    .filter((c) => c !== 'id')
    .map((c) => '`' + c.replace(/[^a-z0-9_]/gi, '') + '` = VALUES(`' + c.replace(/[^a-z0-9_]/gi, '') + '`)')
    .join(', ');
  const sql = `INSERT INTO ${t(table)} (${quoted}) VALUES (${ph})` + (sets ? ` ON DUPLICATE KEY UPDATE ${sets}` : '');
  const runner = conn || db();
  const [res] = await runner.execute(sql, cols.map((c) => list[0][c] === undefined ? null : list[0][c]));
  return res && res.insertId ? Number(res.insertId) : 0;
}

async function getCompany() {
  const row = (await qOne(`SELECT * FROM ${t('company_settings')} WHERE id = 1`)) || {};
  const p = jd(row.payload_json, {});
  for (const k of ['name', 'tagline', 'addr1', 'addr2', 'phone', 'phone2', 'email', 'npwp', 'city', 'signer', 'bank', 'color', 'logo_url']) {
    if (row[k] !== undefined && row[k] !== null) p[k] = row[k];
  }
  if (row.signer_title !== undefined && row.signer_title !== null) p.signerTitle = row.signer_title;
  if (row.num_fmt !== undefined && row.num_fmt !== null) p.numFmt = row.num_fmt;
  if (row.fmt_gar !== undefined && row.fmt_gar !== null) p.fmt_GAR = row.fmt_gar;
  if (row.fmt_tag !== undefined && row.fmt_tag !== null) p.fmt_TAG = row.fmt_tag;
  if (row.pad !== undefined && row.pad !== null) p.pad = parseInt(row.pad, 10);
  if (row.logo_file_id !== undefined && row.logo_file_id !== null) p.logoFileId = Number(row.logo_file_id);
  if (p.logo_url) p.logo = p.logo_url;
  delete p.__seq;
  return p;
}

async function upsertCompany(v) {
  const data = v && typeof v === 'object' ? v : {};
  const logoId = data.logoFileId ? parseInt(data.logoFileId, 10) : null;
  const payload = Object.assign({}, data, { logoFileId: logoId });
  await upsertRow('company_settings', [{
    id: 1,
    name: data.name ?? null,
    tagline: data.tagline ?? null,
    addr1: data.addr1 ?? null,
    addr2: data.addr2 ?? null,
    phone: data.phone ?? null,
    phone2: data.phone2 ?? null,
    email: data.email ?? null,
    npwp: data.npwp ?? null,
    city: data.city ?? null,
    signer: data.signer ?? null,
    signer_title: data.signerTitle ?? null,
    bank: data.bank ?? null,
    num_fmt: data.numFmt ?? null,
    fmt_gar: data.fmt_GAR ?? null,
    fmt_tag: data.fmt_TAG ?? null,
    pad: Math.max(1, Math.min(20, parseInt(data.pad, 10) || 3)),
    color: data.color ?? null,
    logo_url: data.logo ?? null,
    logo_file_id: logoId,
    payload_json: j(payload),
    updated_at: now(),
  }]);
}

async function getCounters() {
  const out = defaultCounters();
  for (const r of await q(`SELECT doc_type, seq FROM ${t('counters')}`)) {
    out[r.doc_type] = parseInt(r.seq, 10);
  }
  return out;
}

async function upsertCounters(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const defaults = defaultCounters();
  for (const [k, seq] of Object.entries(value)) {
    if (!Object.prototype.hasOwnProperty.call(defaults, k)) continue;
    await db().execute(
      `INSERT INTO ${t('counters')} (doc_type, seq, updated_at) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE seq = GREATEST(seq, VALUES(seq)), updated_at = VALUES(updated_at)`,
      [k, Math.max(0, parseInt(seq, 10) || 0), now()]
    );
  }
}

async function getOffice() {
  const row = (await qOne(`SELECT * FROM ${t('office_settings')} WHERE id = 1`)) || {};
  const p = jd(row.payload_json, {});
  for (const k of ['tpl', 'pphPay', 'pphRep', 'ppnPay', 'ppnRep']) {
    if (row[k] !== undefined && row[k] !== null) p[k] = parseInt(row[k], 10);
  }
  if (!p.pphPay) p.pphPay = 15;
  if (!p.waNumber) p.waNumber = cfg.waNumber;
  return p;
}

async function upsertOffice(v) {
  const data = v && typeof v === 'object' ? v : {};
  data.pphPay = Math.max(1, Math.min(31, parseInt(data.pphPay, 10) || 15));
  data.pphRep = Math.max(1, Math.min(31, parseInt(data.pphRep, 10) || 20));
  data.ppnPay = Math.max(1, Math.min(31, parseInt(data.ppnPay, 10) || 31));
  data.ppnRep = Math.max(1, Math.min(31, parseInt(data.ppnRep, 10) || 31));
  data.waNumber = String(data.waNumber ?? cfg.waNumber).replace(/\D+/g, '') || cfg.waNumber;
  await upsertRow('office_settings', [{
    id: 1,
    tpl: data.tpl ?? null,
    pphPay: data.pphPay,
    pphRep: data.pphRep,
    ppnPay: data.ppnPay,
    ppnRep: data.ppnRep,
    payload_json: j(data),
    updated_at: now(),
  }]);
}

async function getTaxDone() {
  const rows = await q(
    `SELECT td.*, f.original_name AS file_name, pf.original_name AS paid_name
     FROM ${t('tax_done')} td
     LEFT JOIN ${t('files')} f ON f.id = td.file_id
     LEFT JOIN ${t('files')} pf ON pf.id = td.paid_file_id
     ORDER BY td.period_key`
  );
  const out = {};
  for (const r of rows) {
    const fileId = r.file_id === null || r.file_id === undefined ? null : Number(r.file_id);
    const paidId = r.paid_file_id === null || r.paid_file_id === undefined ? null : Number(r.paid_file_id);
    out[r.period_key] = {
      done: !!r.done,
      fileId,
      fileUrl: fileId ? 'api.php?r=file.get&id=' + fileId : null,
      fileName: r.file_name,
      paidFileId: paidId,
      paidFileUrl: paidId ? 'api.php?r=file.get&id=' + paidId : null,
      paidFileName: r.paid_name,
      note: r.note,
    };
  }
  return out;
}

async function upsertTaxDone(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const sql = `INSERT INTO ${t('tax_done')} (period_key, done, file_id, paid_file_id, note, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      done = CASE WHEN file_id IS NOT NULL THEN 1 ELSE VALUES(done) END,
      file_id = CASE WHEN VALUES(file_id) IS NULL THEN file_id ELSE VALUES(file_id) END,
      paid_file_id = CASE WHEN VALUES(paid_file_id) IS NULL THEN paid_file_id ELSE VALUES(paid_file_id) END,
      note = CASE WHEN VALUES(note) IS NULL THEN note ELSE VALUES(note) END,
      updated_at = VALUES(updated_at)`;
  for (const [key, v] of Object.entries(value)) {
    if (!key) continue;
    const arr = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    const fileId = arr.fileId ? parseInt(arr.fileId, 10) : null;
    const paidId = arr.paidFileId ? parseInt(arr.paidFileId, 10) : null;
    const done = fileId ? 1 : ((v && typeof v === 'object' && !Array.isArray(v)) ? (arr.done ? 1 : 0) : (v ? 1 : 0));
    const note = arr.note !== undefined ? String(arr.note).slice(0, 500) : null;
    await db().execute(sql, [key, done, fileId, paidId, note, now()]);
  }
}

async function getUi() {
  const out = {};
  for (const r of await q(`SELECT k, v FROM ${t('ui_settings')}`)) out[r.k] = r.v;
  return out;
}

async function getHistory() {
  const out = [];
  for (const r of await q(`SELECT payload_json FROM ${t('transactions')} ORDER BY id DESC`)) {
    const tx = jd(r.payload_json, null);
    if (tx && typeof tx === 'object' && !Array.isArray(tx)) out.push(tx);
  }
  return out;
}

async function getInvoiceEntries() {
  const out = [];
  for (const r of await q(`SELECT source, payload_json FROM ${t('invoice_entries')} ORDER BY id ASC`)) {
    const row = jd(r.payload_json, null);
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    row.src = r.source ? 1 : parseInt(row.src, 10) || 0;
    out.push(row);
  }
  return out;
}

async function upsertInvoiceRows(rows) {
  if (!Array.isArray(rows)) return;
  await withTx(async (conn) => {
    const ids = [];
    for (const r of rows) {
      if (!r || typeof r !== 'object' || !r.id) continue;
      const id = parseInt(r.id, 10);
      ids.push(id);
      let sub = 0;
      for (const it of (Array.isArray(r.items) ? r.items : [])) {
        sub += n(it.q) * n(it.p);
      }
      const ppnPct = n(r.ppn);
      const ppnAmt = Math.round(sub * ppnPct / 100 * 100) / 100;
      const grand = Math.round((sub + ppnAmt) * 100) / 100;
      await upsertRow('invoice_entries', [{
        id,
        source: r.src ? 1 : 0,
        transaction_id: r.transaction_id ? parseInt(r.transaction_id, 10) : null,
        no: r.no ?? null,
        date: iso(r.date),
        client: r.client ?? null,
        addr: r.addr ?? null,
        pono: r.pono ?? null,
        ppn: ppnPct,
        nilai_transaksi: Math.round(sub * 100) / 100,
        ppn_amount: ppnAmt,
        grand_total: grand,
        nilai_akhir: Math.round(sub * 100) / 100,
        paid: r.paid ? 1 : 0,
        pd: iso(r.pd),
        acct: r.acct ?? null,
        ref: r.ref ?? null,
        cut: n(r.cut),
        payload_json: j(r),
        updated_at: now(),
      }], conn);
    }
    if (ids.length) {
      await conn.execute(
        `DELETE FROM ${t('invoice_entries')} WHERE id NOT IN (${ids.map(() => '?').join(',')})`,
        ids
      );
    } else {
      await conn.execute(`DELETE FROM ${t('invoice_entries')}`);
    }
  });
}

function pickVal(p, key, fallback = null) {
  if (p && typeof p === 'object' && Object.prototype.hasOwnProperty.call(p, key)) return p[key];
  if (p && p.prabu && typeof p.prabu === 'object' && Object.prototype.hasOwnProperty.call(p.prabu, key)) return p.prabu[key];
  const flat = 'prabu.' + key;
  if (p && typeof p === 'object' && Object.prototype.hasOwnProperty.call(p, flat)) return p[flat];
  return fallback;
}

async function bootstrapData() {
  const [settings, officeSettings, counters, history, invoiceEntries, taxDone, ui] = await Promise.all([
    getCompany(), getOffice(), getCounters(), getHistory(), getInvoiceEntries(), getTaxDone(), getUi(),
  ]);
  return {
    ok: true,
    settings,
    officeSettings,
    counters,
    history,
    invoiceEntries,
    taxDone,
    ui,
  };
}

module.exports = {
  upsertRow, getCompany, upsertCompany, getCounters, upsertCounters,
  getOffice, upsertOffice, getTaxDone, upsertTaxDone, getUi,
  getHistory, getInvoiceEntries, upsertInvoiceRows, pickVal, bootstrapData,
};
