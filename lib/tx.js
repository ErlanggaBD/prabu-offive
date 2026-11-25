'use strict';

const { db, t, q, qOne, withTx } = require('./db');
const { j, n, iso, now } = require('./util');
const { upsertRow, getCompany, getCounters } = require('./store');
const { allocateNumbers } = require('./numbers');

async function upsertTx(tx, allocate = true, user = null) {
  if (!tx || typeof tx !== 'object' || !tx.id) throw new Error('Transaksi tidak valid.');
  const id = parseInt(tx.id, 10);
  const exists = await qOne(`SELECT id FROM ${t('transactions')} WHERE id = ?`, [id]);

  let counters = null;
  if (allocate && !exists && tx.numsAuto) {
    const company = await getCompany();
    const allocated = await allocateNumbers(tx, company);
    tx.nums = allocated.nums;
    counters = allocated.counters;
  }

  const items = Array.isArray(tx.items) ? tx.items : [];
  let sub = 0;
  for (const it of items) {
    const disc = n(it.disc);
    sub += n(it.qty) * n(it.price) * (1 - disc / 100);
  }
  const ppnPct = n(tx.ppn);
  const ppnAmt = Math.round(sub * ppnPct / 100 * 100) / 100;
  const grand = Math.round((sub + ppnAmt) * 100) / 100;
  const dpPct = n(tx.dpPct);
  const dpAmt = Math.round(grand * dpPct / 100 * 100) / 100;
  const mode = dpPct > 0 ? String(tx.billMode || 'full') : 'full';
  const due = mode === 'dp' ? dpAmt : (mode === 'lunas' ? Math.round((grand - dpAmt) * 100) / 100 : grand);

  let createdAt = now();
  if (exists) {
    if (exists.created_at) createdAt = exists.created_at;
  } else if (tx.createdAt) {
    createdAt = String(tx.createdAt);
  }

  await withTx(async (conn) => {
    await upsertRow('transactions', [{
      id,
      po_no: tx.poNo ?? null,
      po_date: iso(tx.poDate),
      doc_date: iso(tx.docDate),
      ship_date: iso(tx.shipDate),
      due_date: iso(tx.dueDate),
      tag_date: iso(tx.tagDate),
      client_name: tx.clientName ?? null,
      client_code: tx.clientCode ?? null,
      client_phone: tx.clientPhone ?? null,
      pic_name: tx.picName ?? null,
      pic_title: tx.picTitle ?? null,
      salut: tx.salut ?? null,
      client_addr: tx.clientAddr ?? null,
      ppn: ppnPct,
      dp_pct: dpPct,
      bill_mode: mode,
      subtotal: Math.round(sub * 100) / 100,
      ppn_amount: ppnAmt,
      grand_total: grand,
      dp_amount: dpAmt,
      due_amount: due,
      gar_days: tx.garDays ? parseInt(tx.garDays, 10) : null,
      po_file_id: tx.poFileId ? parseInt(tx.poFileId, 10) : null,
      doc_numbers: j(tx.nums || []),
      payload_json: j(tx),
      created_by: user ? user.id : null,
      updated_by: user ? user.id : null,
      created_at: createdAt,
      updated_at: now(),
    }], conn);

    await conn.execute(`DELETE FROM ${t('transaction_items')} WHERE transaction_id = ?`, [id]);
    const ins = `INSERT INTO ${t('transaction_items')}
      (transaction_id, line_no, descr, sn, qty, unit, price, disc, line_amount, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const disc = n(it.disc);
      const line = n(it.qty) * n(it.price) * (1 - disc / 100);
      await conn.execute(ins, [
        id, i, it.desc ?? null, it.sn ?? null, n(it.qty), it.unit ?? null,
        n(it.price), disc, Math.round(line * 100) / 100, j(it),
      ]);
    }

    if (tx.poFileId) {
      await conn.execute(`UPDATE ${t('files')} SET transaction_id = ? WHERE id = ?`, [id, parseInt(tx.poFileId, 10)]);
    }
  });

  return { tx, counters };
}

async function deleteTx(id) {
  id = parseInt(id, 10);
  await withTx(async (conn) => {
    await conn.execute(`DELETE FROM ${t('transactions')} WHERE id = ?`, [id]);
    await conn.execute(`DELETE FROM ${t('invoice_entries')} WHERE transaction_id = ?`, [id]);
    if (id) await conn.execute(`UPDATE ${t('files')} SET transaction_id = NULL WHERE transaction_id = ?`, [id]);
  });
  return getCounters();
}

module.exports = { upsertTx, deleteTx };
