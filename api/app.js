'use strict';

const fs = require('fs');
const path = require('path');
const { currentUser } = require('../lib/auth');
const { redirect } = require('../lib/util');

module.exports = async function app(req, res) {
  try {
    const user = await currentUser(req);
    if (!user) return redirect(res, '/login.php?next=' + encodeURIComponent('app.php'));

    const candidates = [
      path.join(__dirname, 'app-source.html'),
      path.join(__dirname, '..', 'app-source.html'),
    ];
    const file = candidates.find((p) => fs.existsSync(p));
    if (!file) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end('File aplikasi tidak ditemukan.');
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.end(fs.readFileSync(file));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Gagal memuat aplikasi: ' + (e && e.message ? e.message : 'error'));
  }
};
