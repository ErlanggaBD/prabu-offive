'use strict';

require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const cfg = require('../lib/config');
const { db, t, qOne } = require('../lib/db');
const { defaultCounters } = require('../lib/numbers');
const { now } = require('../lib/util');

async function main() {
  if (!cfg.name || cfg.name === 'nama_database' || !cfg.user || !cfg.host) {
    throw new Error('Isi TIDB_HOST, TIDB_USER, TIDB_PASSWORD, dan TIDB_NAME di .env.local dulu.');
  }
  if (!cfg.adminPass || String(cfg.adminPass).length < 8) {
    throw new Error('ADMIN_PASS wajib diisi dan minimal 8 karakter.');
  }

  const sqlPath = path.join(__dirname, '..', 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8').replace(/__PREFIX__/g, cfg.prefix);
  for (const stmt of sql.split(/;\s*(?:\r?\n|$)/)) {
    if (stmt.trim()) await db().query(stmt);
  }

  const upgrades = [
    `ALTER TABLE ${t('files')} MODIFY kind ENUM('po','pdf','logo','bukti','spt_masa','spt_tahunan') NOT NULL`,
    `ALTER TABLE ${t('files')} ADD COLUMN ref_key VARCHAR(255) NULL AFTER doc_type`,
    `ALTER TABLE ${t('tax_done')} ADD COLUMN file_id BIGINT UNSIGNED NULL AFTER done`,
    `ALTER TABLE ${t('tax_done')} ADD COLUMN paid_file_id BIGINT UNSIGNED NULL AFTER file_id`,
    `ALTER TABLE ${t('tax_done')} ADD COLUMN note TEXT NULL AFTER paid_file_id`,
  ];
  for (const stmt of upgrades) {
    try { await db().query(stmt); } catch (e) { /* kolom sudah ada */ }
  }

  for (const [k, seq] of Object.entries(defaultCounters())) {
    await db().execute(
      `INSERT IGNORE INTO ${t('counters')} (doc_type, seq, updated_at) VALUES (?, ?, ?)`,
      [k, seq, now()]
    );
  }

  const existing = await qOne(`SELECT id FROM ${t('user')} WHERE username = ?`, [cfg.adminUser]);
  if (existing) {
    console.log('User "' + cfg.adminUser + '" sudah ada. Password tidak diubah.');
  } else {
    const hash = bcrypt.hashSync(String(cfg.adminPass), 10);
    await db().execute(
      `INSERT INTO ${t('user')} (username, password_hash, nama, aktif, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
      [cfg.adminUser, hash, 'Admin', now(), now()]
    );
    console.log('User "' + cfg.adminUser + '" dibuat.');
  }

  console.log('Install database selesai.');
  await db().end();
}

main().catch(async (e) => {
  console.error('Install gagal:', e && e.message ? e.message : e);
  try { await db().end(); } catch (_) { /* abaikan */ }
  process.exit(1);
});
