'use strict';

const Busboy = require('busboy');
const { HttpError, getBody, send, now } = require('../lib/util');
const { db, t, q } = require('../lib/db');
const { currentUser, requireUser, requireCsrf, logoutCurrent } = require('../lib/auth');
const { auditLog } = require('../lib/audit');
const store = require('../lib/store');
const { upsertTx, deleteTx } = require('../lib/tx');
const { uploadFile, redirectFile, deleteFile } = require('../lib/storage');

function needPost(req) {
  if (req.method !== 'POST') throw new HttpError(405, { ok: false, error: 'method' });
}

function query(req, key) {
  if (req.query && req.query[key] !== undefined) return req.query[key];
  try {
    return new URL(req.url || '/', 'http://localhost').searchParams.get(key) || '';
  } catch (e) {
    return '';
  }
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    let bb;
    try {
      bb = Busboy({ headers: req.headers, limits: { fileSize: 30 * 1024 * 1024, files: 1 } });
    } catch (e) {
      reject(e);
      return;
    }
    const fields = {};
    let file = null;
    bb.on('field', (name, value) => { fields[name] = value; });
    bb.on('file', (name, stream, info) => {
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => {
        file = {
          field: name,
          filename: info.filename || 'file',
          mimeType: info.mimeType || '',
          buffer: Buffer.concat(chunks),
        };
      });
    });
    bb.on('error', reject);
    bb.on('close', () => resolve({ fields, file }));
    req.pipe(bb);
  });
}

module.exports = async function bridge(req, res) {
  let headers = {};
  try {
    const contentType = String((req.headers || {})['content-type'] || '').toLowerCase();
    const multipart = contentType.startsWith('multipart/form-data');
    const body = multipart ? {} : await getBody(req);
    const route = String(query(req, 'r') || '');
    const user = await currentUser(req);

    switch (route) {
      case 'auth.me': {
        return send(res, {
          authenticated: !!user,
          csrf: user ? user.csrf : null,
          user: user ? { id: Number(user.id), username: user.username, nama: user.nama } : null,
        });
      }

      case 'auth.logout': {
        needPost(req);
        requireCsrf(req, user, body);
        await auditLog('logout', 'session', String(user.session_id), [], Number(user.id));
        headers['Set-Cookie'] = await logoutCurrent(req);
        return send(res, { ok: true }, 200, headers);
      }

      case 'bootstrap': {
        requireUser(user);
        return send(res, await store.bootstrapData());
      }

      case 'state.save': {
        needPost(req);
        requireCsrf(req, user, body);
        const scope = String(body.scope || '');
        const value = body.value;
        if (scope === 'settings') await store.upsertCompany(value);
        else if (scope === 'counters') await store.upsertCounters(value);
        else if (scope === 'po_d') await store.upsertInvoiceRows(value);
        else if (scope === 'po_s') await store.upsertOffice(value);
        else if (scope === 'po_t') await store.upsertTaxDone(value);
        else if (scope === 'history') { /* tx.save menangani penomoran */ }
        else throw new HttpError(400, { ok: false, error: 'scope tidak dikenali' });
        await auditLog('state.save', scope, '', { scope }, Number(user.id));
        return send(res, { ok: true });
      }

      case 'ui.save': {
        needPost(req);
        requireCsrf(req, user, body);
        const k = String(body.key || '');
        if (!k) throw new HttpError(400, { ok: false, error: 'key kosong' });
        await store.upsertRow('ui_settings', [{
          k: k.slice(0, 64),
          v: body.value === undefined || body.value === null ? null : String(body.value),
          updated_at: now(),
        }]);
        return send(res, { ok: true });
      }

      case 'tx.save': {
        needPost(req);
        requireCsrf(req, user, body);
        const saved = await upsertTx(body.tx, !!body.allocate, user);
        await auditLog('tx.save', 'transaction', String(saved.tx.id), { poNo: saved.tx.poNo ?? null }, Number(user.id));
        return send(res, {
          ok: true,
          tx: saved.tx,
          counters: saved.counters || await store.getCounters(),
        });
      }

      case 'tx.delete': {
        needPost(req);
        requireCsrf(req, user, body);
        const id = parseInt(body.id, 10) || 0;
        await deleteTx(id);
        await auditLog('tx.delete', 'transaction', String(id), [], Number(user.id));
        return send(res, { ok: true });
      }

      case 'file.upload': {
        needPost(req);
        requireCsrf(req, user, body);
        const parts = await parseMultipart(req);
        const resUpload = await uploadFile(parts.file, String(parts.fields.kind || 'po'), parts.fields, Number(user.id));
        return send(res, Object.assign({ ok: true }, resUpload));
      }

      case 'file.get': {
        requireUser(user);
        return await redirectFile(query(req, 'id'), res);
      }

      case 'file.delete': {
        needPost(req);
        requireCsrf(req, user, body);
        return send(res, await deleteFile(body.id, user));
      }

      case 'session.list': {
        requireUser(user);
        const rows = await q(
          `SELECT id, device_label, ip, created_at, last_seen_at, expires_at
           FROM ${t('sessions')}
           WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
           ORDER BY last_seen_at DESC`,
          [user.id, now()]
        );
        return send(res, { ok: true, sessions: rows, current: Number(user.session_id) });
      }

      case 'session.revoke': {
        needPost(req);
        requireCsrf(req, user, body);
        const id = parseInt(body.id, 10) || 0;
        await db().execute(
          `UPDATE ${t('sessions')} SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
          [now(), id, user.id]
        );
        await auditLog('session.revoke', 'session', String(id), [], Number(user.id));
        return send(res, { ok: true });
      }

      case 'backup.export': {
        requireUser(user);
        const data = await store.bootstrapData();
        delete data.ok;
        data.exportedAt = now();
        return send(res, data);
      }

      case 'migrate.import': {
        needPost(req);
        requireCsrf(req, user, body);
        const p = body.payload && typeof body.payload === 'object' ? body.payload : body;
        const settings = store.pickVal(p, 'settings', null);
        const counters = store.pickVal(p, 'counters', null);
        const history = store.pickVal(p, 'history', null);
        const poD = p.po_d ?? null;
        const poS = p.po_s ?? null;
        const poT = p.po_t ?? null;
        const theme = store.pickVal(p, 'theme', null);

        if (settings && typeof settings === 'object') await store.upsertCompany(settings);
        if (counters && typeof counters === 'object') await store.upsertCounters(counters);
        if (poS && typeof poS === 'object') await store.upsertOffice(poS);
        if (poT && typeof poT === 'object') await store.upsertTaxDone(poT);
        if (Array.isArray(history)) {
          for (const tx of history) await upsertTx(tx, false, user);
        }
        if (Array.isArray(poD)) await store.upsertInvoiceRows(poD);
        if (theme !== null && theme !== undefined) {
          await store.upsertRow('ui_settings', [{
            k: 'prabu.theme',
            v: String(theme),
            updated_at: now(),
          }]);
        }

        await auditLog('migrate.import', 'database', '', {
          settings: !!settings,
          history: Array.isArray(history) ? history.length : 0,
          po_d: Array.isArray(poD) ? poD.length : 0,
        }, Number(user.id));
        return send(res, Object.assign({ ok: true }, await store.bootstrapData()));
      }

      default:
        return send(res, { ok: false, error: 'route tidak dikenali' }, 404);
    }
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.payload, e.status, headers);
    console.error('[prabu]', e);
    return send(res, { ok: false, error: e && e.message ? e.message : 'error' }, 500, headers);
  }
};
