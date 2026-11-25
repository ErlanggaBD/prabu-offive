'use strict';

const { db, t, qOne, q } = require('./db');
const { HttpError, now, randomToken, sha256, safeEqual, parseCookies, s } = require('./util');
const cfg = require('./config');

function clientIp(req) {
  const h = req.headers || {};
  const cf = h['cf-connecting-ip'];
  if (cf) return String(cf).split(',')[0].trim();
  const xf = h['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || null;
}

function deviceLabel(req) {
  return s((req.headers || {})['user-agent'] || 'Perangkat', 255);
}

function nowMinus(seconds) {
  return new Date(Date.now() - seconds * 1000)
    .toLocaleString('sv-SE', { timeZone: cfg.tz })
    .replace('T', ' ')
    .slice(0, 19);
}

async function currentUser(req) {
  const cookie = parseCookies(req).prabu_sess || '';
  if (!cookie) return null;

  const user = await qOne(
    `SELECT s.id AS session_id, s.csrf, s.device_label, s.ip, s.expires_at,
            u.id, u.username, u.nama, u.aktif
     FROM ${t('sessions')} s
     JOIN ${t('user')} u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.aktif = 1
     LIMIT 1`,
    [sha256(cookie), now()]
  );
  if (!user) return null;

  await q(
    `UPDATE ${t('sessions')} SET last_seen_at = ? WHERE id = ? AND last_seen_at < ?`,
    [now(), user.session_id, nowMinus(60)]
  );
  return user;
}

function requireUser(user) {
  if (!user) throw new HttpError(401, { ok: false, error: 'login', login_url: '/login.php' });
  return user;
}

function requireCsrf(req, user, body = {}) {
  if (!user) throw new HttpError(401, { ok: false, error: 'login' });
  let given = (req.headers || {})['x-csrf-token'];
  if (!given && body && body.csrf) given = body.csrf;
  if (!safeEqual(user.csrf, given)) throw new HttpError(403, { ok: false, error: 'csrf' });
  return user;
}

async function makeSession(user, req) {
  const token = randomToken();
  const csrf = randomToken();
  const ttl = 30 * 86400;
  const exp = new Date(Date.now() + ttl * 1000)
    .toLocaleString('sv-SE', { timeZone: cfg.tz })
    .replace('T', ' ')
    .slice(0, 19);

  await db().execute(
    `INSERT INTO ${t('sessions')}
     (token_hash, user_id, device_label, ip, csrf, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [sha256(token), user.id, deviceLabel(req), clientIp(req), csrf, now(), now(), exp]
  );

  return { token, csrf, expires: exp, ttl };
}

function sessionCookie(token, ttl = 30 * 86400) {
  const parts = [
    'prabu_sess=' + encodeURIComponent(token),
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=' + ttl,
    'Expires=' + new Date(Date.now() + ttl * 1000).toUTCString(),
  ];
  return parts.join('; ');
}

function clearSessionCookie() {
  return [
    'prabu_sess=',
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ].join('; ');
}

function loginCsrfCookie(token) {
  return [
    'prabu_login_csrf=' + encodeURIComponent(token),
    'Path=/login.php',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=1800',
  ].join('; ');
}

async function logoutCurrent(req) {
  const cookie = parseCookies(req).prabu_sess || '';
  if (cookie) {
    await q(
      `UPDATE ${t('sessions')} SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`,
      [now(), sha256(cookie)]
    );
  }
  return clearSessionCookie();
}

module.exports = {
  clientIp, deviceLabel, currentUser, requireUser, requireCsrf,
  makeSession, sessionCookie, clearSessionCookie, loginCsrfCookie,
  logoutCurrent, parseCookies,
};
