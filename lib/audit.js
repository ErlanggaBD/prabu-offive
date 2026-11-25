'use strict';

const { db, t } = require('./db');
const { j, now, s } = require('./util');

async function auditLog(action, entity = '', entityId = '', meta = [], userId = null, ip = null) {
  try {
    await db().execute(
      `INSERT INTO ${t('audit_logs')} (user_id, action, entity, entity_id, meta, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        s(action, 100),
        s(entity, 100),
        s(entityId, 100),
        Array.isArray(meta) || (meta && typeof meta === 'object') ? j(meta) : s(meta),
        ip ? s(ip, 45) : null,
        now(),
      ]
    );
  } catch (e) {
    // Audit gagal tidak boleh menggagalkan aksi utama.
  }
}

module.exports = { auditLog };
