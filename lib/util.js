'use strict';

const crypto = require('crypto');
const cfg = require('./config');

class HttpError extends Error {
  constructor(status, payload) {
    super(payload && payload.error ? payload.error : 'error');
    this.status = status;
    this.payload = payload || { ok: false, error: this.message };
  }
}

function now() {
  return new Date()
    .toLocaleString('sv-SE', { timeZone: cfg.tz })
    .replace('T', ' ')
    .slice(0, 19);
}

function j(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function jd(value, fallback = []) {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    const x = JSON.parse(String(value));
    return x && typeof x === 'object' ? x : fallback;
  } catch (e) {
    return fallback;
  }
}

function n(value, fallback = 0) {
  const v = String(value === undefined || value === null ? '' : value).replace(',', '.');
  const f = parseFloat(v);
  return Number.isFinite(f) ? f : fallback;
}

function iso(value) {
  const v = String(value === undefined || value === null ? '' : value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function s(value, max = null) {
  let v = value === undefined || value === null ? '' : String(value);
  if (max) v = v.slice(0, max);
  return v;
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers && req.headers.cookie ? req.headers.cookie : '';
  for (const part of String(raw).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch (e) {
      out[k] = part.slice(i + 1).trim();
    }
  }
  return out;
}

async function readRaw(req, limit = 30 * 1024 * 1024) {
  if (req.readableEnded || req.complete && !req.headers['content-length'] && !req.headers['transfer-encoding']) {
    return '';
  }
  return await new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, { ok: false, error: 'Body terlalu besar.' }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function getBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = await readRaw(req);
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    const out = {};
    for (const pair of raw.split('&')) {
      const i = pair.indexOf('=');
      if (i < 0) continue;
      try {
        out[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
      } catch (e2) { /* abaikan */ }
    }
    return out;
  }
}

function send(res, data, code = 200, extraHeaders = {}) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.end(j(data));
}

function redirect(res, location, code = 302) {
  res.statusCode = code;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  HttpError, now, j, jd, n, iso, s, randomToken, sha256, safeEqual,
  parseCookies, readRaw, getBody, send, redirect, escapeHtml,
};
