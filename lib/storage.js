'use strict';

const crypto = require('crypto');
const { put, del } = require('@vercel/blob');
const { db, t, qOne } = require('./db');
const { now, s } = require('./util');
const cfg = require('./config');
const { auditLog } = require('./audit');

const KINDS = ['po', 'pdf', 'logo', 'bukti', 'spt_masa', 'spt_tahunan'];

function maxSize(kind) {
  if (kind === 'logo') return 3 * 1024 * 1024;
  if (['bukti', 'spt_masa', 'spt_tahunan'].includes(kind)) return 15 * 1024 * 1024;
  return 25 * 1024 * 1024;
}

function allowed(kind) {
  if (kind === 'logo') return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (['pdf', 'spt_masa', 'spt_tahunan'].includes(kind)) return ['application/pdf'];
  if (kind === 'bukti') return ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  return ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
}

function extension(mime) {
  return {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
  }[mime] || 'bin';
}

function detectMime(buf) {
  if (buf.length >= 5 && buf.slice(0, 5).toString('latin1').startsWith('%PDF')) return 'application/pdf';
  if (buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 6 && ['GIF87a', 'GIF89a'].includes(buf.slice(0, 6).toString('latin1'))) return 'image/gif';
  if (buf.length >= 12 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.length >= 12 && buf.slice(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.slice(8, 12).toString('latin1');
    if (/^(heic|heix|hevc|hevx|mif1|msf1)$/.test(brand)) return 'image/heic';
  }
  return null;
}

async function uploadFile(file, kind, meta = {}, userId = null) {
  kind = KINDS.includes(kind) ? kind : 'po';
  if (!file || !file.buffer || !file.buffer.length) throw new Error('Tidak ada file yang terunggah.');
  if (file.buffer.length > maxSize(kind)) throw new Error('Ukuran file terlalu besar.');

  const mime = detectMime(file.buffer);
  if (!mime || !allowed(kind).includes(mime)) {
    throw new Error('Jenis file tidak diizinkan: ' + (mime || 'tidak dikenali'));
  }
  if (!cfg.blobToken) throw new Error('BLOB_READ_WRITE_TOKEN belum diisi di environment Vercel.');

  const nowDate = new Date().toLocaleString('sv-SE', { timeZone: cfg.tz || 'Asia/Jakarta' });
  const ym = nowDate.slice(0, 7).replace('-', '');
  const pathname = 'uploads/' + kind + '/' + ym + '/' + crypto.randomBytes(16).toString('hex') + '.' + extension(mime);
  const blob = await put(pathname, file.buffer, {
    access: 'public',
    contentType: mime,
    token: cfg.blobToken,
  });
  const url = blob.url;

  const original = s(file.filename || 'file', 255);
  const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const txId = meta.transactionId ? parseInt(meta.transactionId, 10) : null;
  const docType = meta.docType ? s(meta.docType, 10) : null;
  const refKey = meta.refKey ? s(meta.refKey, 255) : null;

  const st = await db().execute(
    `INSERT INTO ${t('files')}
     (kind, transaction_id, doc_type, ref_key, original_name, stored_name, rel_path, mime, size_bytes, sha256, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [kind, txId, docType, refKey, original, pathname.split('/').pop(), url, mime, file.buffer.length, hash, userId, now()]
  );
  const id = Number(st[0].insertId);

  if (txId && kind === 'po') {
    await db().execute(`UPDATE ${t('transactions')} SET po_file_id = ? WHERE id = ?`, [id, txId]);
  }
  if (txId && kind === 'pdf') {
    await db().execute(
      `INSERT INTO ${t('transaction_documents')} (transaction_id, doc_type, doc_no, file_id, generated_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE file_id = VALUES(file_id), generated_at = VALUES(generated_at)`,
      [txId, docType || 'ALL', meta.docNo ?? null, id, now()]
    );
  }
  if (refKey && ['spt_masa', 'spt_tahunan'].includes(kind)) {
    const note = String(meta.label || '').trim() + ' ' + String(meta.period || '').trim();
    await db().execute(
      `INSERT INTO ${t('tax_done')} (period_key, done, file_id, note, updated_at)
       VALUES (?, 1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE done = 1, file_id = VALUES(file_id), note = VALUES(note), updated_at = VALUES(updated_at)`,
      [refKey, id, note.trim() || null, now()]
    );
  }

  await auditLog('file.upload', kind, String(id), { path: url }, userId);
  return {
    id,
    kind,
    url: 'api.php?r=file.get&id=' + id,
    path: 'storage/' + pathname,
    originalName: original,
    mime,
    size: file.buffer.length,
    sha256: hash,
  };
}

async function fileRow(id) {
  return await qOne(`SELECT * FROM ${t('files')} WHERE id = ?`, [parseInt(id, 10) || 0]);
}

async function redirectFile(id, res) {
  const row = await fileRow(id);
  if (!row) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'File tidak ditemukan.' }));
    return;
  }
  if (!row.rel_path || !/^https?:\/\//.test(row.rel_path)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'File di penyimpanan tidak ditemukan.' }));
    return;
  }
  res.statusCode = 302;
  res.setHeader('Location', row.rel_path);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end();
}

async function deleteFile(id, user) {
  id = parseInt(id, 10) || 0;
  const row = await fileRow(id);
  if (row) {
    if (row.rel_path && cfg.blobToken) {
      try { await del(row.rel_path, { token: cfg.blobToken }); } catch (e) { /* abaikan */ }
    }
    await db().execute(`DELETE FROM ${t('files')} WHERE id = ?`, [id]);
    if (row.ref_key && ['spt_masa', 'spt_tahunan'].includes(row.kind)) {
      await db().execute(
        `UPDATE ${t('tax_done')} SET done = 0, file_id = NULL WHERE period_key = ? AND file_id = ?`,
        [row.ref_key, id]
      );
    }
    await auditLog('file.delete', row.kind, String(id), { path: row.rel_path }, user ? user.id : null);
  }
  return { ok: true };
}

module.exports = { uploadFile, fileRow, redirectFile, deleteFile, detectMime };
