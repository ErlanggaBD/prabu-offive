'use strict';

const bcrypt = require('bcryptjs');
const { db, t, q, qOne } = require('../lib/db');
const { currentUser, makeSession, sessionCookie, loginCsrfCookie, parseCookies, clientIp } = require('../lib/auth');
const { auditLog } = require('../lib/audit');
const { HttpError, getBody, now, randomToken, safeEqual, redirect, escapeHtml } = require('../lib/util');

function page(error, csrf, next) {
  const e = escapeHtml;
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Masuk · Prabu Office</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f6fb;color:#1b2430;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;padding:20px}
  :root[data-theme="dark"] body,body{background:#0f141a;color:#e4e9ef}
  .box{width:min(380px,100%);background:#fff;color:#1b2430;border:1px solid #d5dde6;border-radius:16px;padding:24px;box-shadow:0 10px 30px rgba(20,40,80,.12)}
  :root[data-theme="dark"] .box{background:#18202a;color:#e4e9ef;border-color:#2d3947}
  h1{margin:0 0 4px;font-size:20px;color:#3560d8}
  p{margin:0 0 18px;color:#5f6b7a;font-size:13px}
  label{display:block;margin-top:12px;font-size:12px;color:#5f6b7a}
  input{width:100%;box-sizing:border-box;margin-top:4px;padding:10px 12px;border:1px solid #d5dde6;border-radius:9px;font:inherit;background:#fff;color:#1b2430}
  :root[data-theme="dark"] input{background:#0f141a;color:#e4e9ef;border-color:#2d3947}
  button{width:100%;margin-top:18px;padding:11px;border:0;border-radius:9px;background:#3560d8;color:#fff;font:inherit;font-weight:700;cursor:pointer}
  .err{margin-top:14px;padding:10px;border-radius:9px;background:#fdecea;color:#b3261e;font-size:13px}
  .foot{margin-top:16px;font-size:11px;color:#5f6b7a;text-align:center}
</style></head><body>
<form class="box" method="post" autocomplete="username">
  <h1>Prabu Office</h1>
  <p>Masuk untuk mengelola data dan dokumen.</p>
  <input type="hidden" name="csrf" value="${e(csrf)}">
  <input type="hidden" name="next" value="${e(next)}">
  <label>Username<input name="username" required autofocus autocomplete="username"></label>
  <label>Password<input name="password" type="password" required autocomplete="current-password"></label>
  <button type="submit">Masuk</button>
  ${error ? `<div class="err">${e(error)}</div>` : ''}
  <div class="foot">Boleh login dari beberapa perangkat bersamaan.</div>
</form>
</body></html>`;
}

function safeNext(next) {
  const allowed = ['app.php', '/app.php', 'app-source.html', '/app-source.html'];
  return allowed.includes(next) ? '/app.php' : '/app.php';
}

module.exports = async function login(req, res) {
  try {
    const cookies = parseCookies(req);
    let csrf = cookies.prabu_login_csrf || '';
    let setCookies = [];
    let error = '';
    let next = '';

    if (req.method === 'POST') {
      const body = await getBody(req);
      next = String(body.next || '');
      if (!csrf || !safeEqual(csrf, body.csrf)) {
        error = 'Sesi login tidak valid. Muat ulang halaman lalu coba lagi.';
      } else {
        const username = String(body.username || '').trim();
        const password = String(body.password || '');
        const user = await qOne(
          `SELECT * FROM ${t('user')} WHERE username = ? AND aktif = 1 LIMIT 1`,
          [username]
        );
        if (!user || !await bcrypt.compare(password, String(user.password_hash))) {
          error = 'Username atau password salah.';
        } else {
          const session = await makeSession(user, req);
          setCookies.push(sessionCookie(session.token, session.ttl));
          await db().execute(
            `UPDATE ${t('user')} SET last_login = ?, updated_at = ? WHERE id = ?`,
            [now(), now(), user.id]
          );
          await auditLog('login', 'user', String(user.id), { device: (req.headers || {})['user-agent'] || 'Perangkat' }, user.id, clientIp(req));
          if (setCookies.length) res.setHeader('Set-Cookie', setCookies);
          return redirect(res, safeNext(next));
        }
      }
    } else if (req.method !== 'GET') {
      throw new HttpError(405, { ok: false, error: 'method' });
    }

    const existing = await currentUser(req);
    if (!error && existing) return redirect(res, '/app.php');

    if (!csrf) {
      csrf = randomToken();
      setCookies.push(loginCsrfCookie(csrf));
    }
    if (setCookies.length) res.setHeader('Set-Cookie', setCookies);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(page(error, csrf, String(next || '')));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: false, error: e && e.message ? e.message : 'error' }));
  }
};
