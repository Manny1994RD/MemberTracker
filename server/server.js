'use strict';
// Church Status server: JSON API, live updates (Server-Sent Events) and the web app.
// No outside packages: Node's built-in HTTP server, crypto and SQLite.
process.removeAllListeners('warning');
process.on('warning', w => { if (w.name !== 'ExperimentalWarning') console.warn(w); });

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { openDatabase } = require('./db');
const { COLS, ID, BadRequest, clean, merge, denyReason, emptyData, exampleData, isPlainObject } = require('./data');
const { translate } = require('./i18n');

const VERSION = require('../package.json').version;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SESSION_DAYS = 30;
const COOKIE = 'cs_session';

/* ---------------- PINs & sessions ---------------- */
// Each person signs in with a PIN only, so every PIN is unique. PINs are stored as a keyed
// hash (HMAC-SHA256 with a random secret kept in the database), never as plain digits.
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const newId = prefix => prefix + crypto.randomBytes(6).toString('hex');
const ADMIN_PIN_LENGTH = 6;
const LEADER_PIN = { min: 4, max: 8 };

function checkPin(pin, role) {
  if (typeof pin !== 'string' || !/^\d+$/.test(pin)) throw new BadRequest('The PIN can only have numbers.');
  if (role === 'admin' && pin.length !== ADMIN_PIN_LENGTH) throw new BadRequest(`The Jefe de Templo PIN needs exactly ${ADMIN_PIN_LENGTH} digits.`);
  if (pin.length < LEADER_PIN.min || pin.length > LEADER_PIN.max) throw new BadRequest(`The PIN needs ${LEADER_PIN.min} to ${LEADER_PIN.max} digits.`);
  if (role === 'admin' && /^(\d)\1+$/.test(pin)) throw new BadRequest('Choose a PIN that isn’t the same digit repeated.');
}
function checkName(n) {
  if (typeof n !== 'string' || !n.trim() || n.length > 120) throw new BadRequest('Enter a name.');
}
const publicUser = u => u && { id: u.id, name: u.name, role: u.role, teamId: u.team_id || null };

/* ---------------- HTTP helpers ---------------- */
function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(data);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new BadRequest('The request is too large.'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new BadRequest('The request body isn’t valid JSON.')); }
    });
    req.on('error', reject);
  });
}
function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'",
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

/* ---------------- app ---------------- */
function createApp({ dbFile, secureCookies = false, log = console.log } = {}) {
  const db = openDatabase(dbFile);
  const clients = new Set();
  const loginAttempts = new Map();
  let failedAll = { n: 0, reset: Date.now() + 15 * 60e3 };
  let secret = db.getSetting('pin_secret');
  if (!secret) { secret = crypto.randomBytes(32).toString('hex'); db.putSetting('pin_secret', secret); }
  const pinHash = pin => crypto.createHmac('sha256', secret).update(String(pin)).digest('hex');
  function pinFree(pin, exceptUserId) {
    const other = db.userByPin(pinHash(pin));
    if (other && other.id !== exceptUserId) throw Object.assign(new Error('Someone already uses that PIN. Choose a different one.'), { status: 409 });
  }

  function sessionUser(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (!token) return null;
    const s = db.session(sha256(token));
    if (!s || s.expires < Date.now()) return null;
    return db.userById(s.user_id) || null;
  }
  function startSession(res, user) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expires = Date.now() + SESSION_DAYS * 864e5;
    db.insertSession(sha256(token), user.id, expires);
    db.purgeSessions();
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secureCookies ? '; Secure' : ''}`);
  }
  function endSession(req, res) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) db.deleteSession(sha256(token));
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookies ? '; Secure' : ''}`);
  }

  // What a user may read
  function visibleData(user) {
    const data = { branches: db.docs('branches'), teams: db.docs('teams'), members: db.docs('members') };
    if (user.role !== 'admin') {
      for (const [id, m] of Object.entries(data.members)) if (m.teamId !== user.team_id) delete data.members[id];
    }
    return data;
  }
  function canSee(user, col, doc) {
    if (user.role === 'admin' || col !== 'members') return true;
    return doc && doc.teamId === user.team_id;
  }

  // Live updates
  function broadcast(col, id, before, after) {
    for (const c of clients) {
      const u = db.userById(c.userId);
      if (!u) { c.res.end(); clients.delete(c); continue; }
      const seeNow = after && canSee(u, col, after), sawBefore = before && canSee(u, col, before);
      if (seeNow) c.res.write(`event: doc\ndata: ${JSON.stringify({ col, id, data: after })}\n\n`);
      else if (sawBefore) c.res.write(`event: doc\ndata: ${JSON.stringify({ col, id, data: null })}\n\n`);
    }
  }
  function broadcastReload() { for (const c of clients) c.res.write('event: reload\ndata: {}\n\n'); }
  setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 25000).unref();

  function writeDoc(user, col, id, op, data) {
    if (!COLS.includes(col)) throw new BadRequest('Unknown record type.');
    if (!ID.test(id)) throw new BadRequest('Invalid record id.');
    if (!['set', 'update', 'delete'].includes(op)) throw new BadRequest('Unknown operation.');
    const existing = db.doc(col, id);
    let next = null;
    if (op === 'delete') {
      if (!existing) return null;
    } else {
      const cleaned = clean(col, data, op === 'update');
      if (op === 'update' && !existing) throw Object.assign(new BadRequest('That record no longer exists.'), { status: 404 });
      next = op === 'set' ? cleaned : merge(existing, cleaned);
      if (op === 'update') clean(col, next, false);
      const reason = denyReason(user, col, op, existing && { ...existing, __id: id }, op === 'set' ? next : cleaned);
      if (reason) throw Object.assign(new Error(reason), { status: 403 });
    }
    if (op === 'delete') {
      const reason = denyReason(user, col, op, { ...existing, __id: id }, null);
      if (reason) throw Object.assign(new Error(reason), { status: 403 });
      db.transaction(() => {
        db.deleteDoc(col, id);
        if (col === 'teams') {
          for (const [mid, m] of Object.entries(db.docs('members'))) if (m.teamId === id) { db.deleteDoc('members', mid); broadcast('members', mid, m, null); }
          db.clearTeamFromUsers(id);
        }
      });
      broadcast(col, id, existing, null);
      return null;
    }
    if (col === 'branches' && next.hasTeams && !existing?.hasTeams) {
      // Only one branch reports through teams.
      for (const [bid, b] of Object.entries(db.docs('branches'))) if (bid !== id && b.hasTeams) { const nb = { ...b, hasTeams: false }; db.putDoc('branches', bid, nb); broadcast('branches', bid, b, nb); }
    }
    db.putDoc(col, id, next);
    broadcast(col, id, existing, next);
    return next;
  }

  function replaceAll(data) {
    for (const col of COLS) if (!isPlainObject(data[col])) throw new BadRequest(`The backup is missing "${col}".`);
    const cleaned = {};
    for (const col of COLS) {
      cleaned[col] = {};
      for (const [id, doc] of Object.entries(data[col])) {
        if (!ID.test(id)) throw new BadRequest(`Invalid id "${id}" in ${col}.`);
        cleaned[col][id] = clean(col, doc, false);
      }
    }
    db.transaction(() => {
      for (const col of COLS) { db.deleteCol(col); for (const [id, doc] of Object.entries(cleaned[col])) db.putDoc(col, id, doc); }
    });
    broadcastReload();
  }

  function seed(kind) {
    const data = kind === 'example' ? exampleData() : emptyData();
    db.transaction(() => { for (const col of COLS) { db.deleteCol(col); for (const [id, doc] of Object.entries(data[col])) db.putDoc(col, id, doc); } });
    return data;
  }

  const routes = [];
  const route = (method, pattern, handler, opts = {}) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler, ...opts });

  route('GET', '/api/status', () => ({ setup: db.countUsers() === 0, version: VERSION }), { auth: false });

  route('POST', '/api/setup', async ({ body, res }) => {
    if (db.countUsers() > 0) throw Object.assign(new Error('Setup is already done. Sign in instead.'), { status: 409 });
    checkName(body.name); checkPin(body.pin, 'admin');
    const user = { id: newId('u'), name: body.name.trim(), role: 'admin', pin_hash: pinHash(body.pin) };
    seed(body.example ? 'example' : 'empty');
    db.insertUser(user);
    if (body.example) {
      // Example team leaders sign in with PINs 1111, 2222, … 5555.
      for (const [tid, t] of Object.entries(db.docs('teams'))) {
        const pin = String(t.num).repeat(4);
        if (!db.userByPin(pinHash(pin))) db.insertUser({ id: newId('u'), name: t.leader, role: 'leader', team_id: tid, pin_hash: pinHash(pin) });
      }
    }
    startSession(res, db.userById(user.id));
    log(`Setup complete. Jefe de Templo account for "${user.name}" created${body.example ? ' with example data' : ''}.`);
    return { user: publicUser(db.userById(user.id)) };
  }, { auth: false });

  route('POST', '/api/login', async ({ req, body, res }) => {
    const ip = req.socket.remoteAddress || 'x';
    const now = Date.now(), a = loginAttempts.get(ip) || { n: 0, reset: now + 15 * 60e3 };
    if (now > a.reset) { a.n = 0; a.reset = now + 15 * 60e3; }
    if (now > failedAll.reset) failedAll = { n: 0, reset: now + 15 * 60e3 };
    // Short PINs are easy to guess, so wrong tries are limited per device and overall.
    if (a.n >= 8 || failedAll.n >= 40) throw Object.assign(new Error('Too many wrong PINs. Wait 15 minutes and try again.'), { status: 429 });
    const pin = typeof body.pin === 'string' && /^\d{4,8}$/.test(body.pin) ? body.pin : null;
    const user = pin && db.userByPin(pinHash(pin));
    if (!user) {
      a.n++; loginAttempts.set(ip, a); failedAll.n++;
      await new Promise(r => setTimeout(r, 400));
      throw Object.assign(new Error('That PIN isn’t right.'), { status: 401 });
    }
    loginAttempts.delete(ip);
    startSession(res, user);
    return { user: publicUser(user) };
  }, { auth: false });

  route('POST', '/api/logout', ({ req, res }) => { endSession(req, res); return { ok: true }; }, { auth: false });
  route('GET', '/api/me', ({ user }) => ({ user: publicUser(user) }));
  route('POST', '/api/me/pin', ({ user, body }) => {
    if (typeof body.current !== 'string' || pinHash(body.current) !== user.pin_hash) throw Object.assign(new Error('Your current PIN isn’t right.'), { status: 400 });
    checkPin(body.next, user.role); pinFree(body.next, user.id);
    db.updateUser(user.id, { pin_hash: pinHash(body.next) });
    return { ok: true };
  });

  route('GET', '/api/data', ({ user }) => visibleData(user));
  route('POST', '/api/docs/:col/:id', ({ user, params, body }) => ({ data: writeDoc(user, params.col, params.id, body.op, body.data) }));

  route('GET', '/api/users', () => ({ users: db.listUsers().map(u => ({ ...publicUser(u), createdAt: u.created_at })) }), { admin: true });
  route('POST', '/api/users', ({ body }) => {
    const role = body.role === 'admin' ? 'admin' : 'leader';
    checkName(body.name); checkPin(body.pin, role); pinFree(body.pin);
    const teamId = role === 'leader' ? (body.teamId || null) : null;
    if (teamId && !db.doc('teams', teamId)) throw new BadRequest('That team doesn’t exist.');
    const u = { id: newId('u'), name: body.name.trim(), role, team_id: teamId, pin_hash: pinHash(body.pin) };
    db.insertUser(u);
    return { user: publicUser(db.userById(u.id)) };
  }, { admin: true });
  route('PATCH', '/api/users/:id', ({ user, params, body }) => {
    const target = db.userById(params.id);
    if (!target) throw Object.assign(new Error('That account no longer exists.'), { status: 404 });
    const fields = {};
    if (body.name !== undefined) { checkName(body.name); fields.name = body.name.trim(); }
    if (body.role !== undefined) {
      if (target.id === user.id && body.role !== 'admin') throw new BadRequest('You can’t remove your own Jefe de Templo access.');
      fields.role = body.role === 'admin' ? 'admin' : 'leader';
    }
    if (body.teamId !== undefined) {
      if (body.teamId && !db.doc('teams', body.teamId)) throw new BadRequest('That team doesn’t exist.');
      fields.team_id = body.teamId || null;
    }
    const role = fields.role || target.role;
    if (body.pin !== undefined && body.pin !== '') { checkPin(body.pin, role); pinFree(body.pin, target.id); fields.pin_hash = pinHash(body.pin); }
    else if (role === 'admin' && target.role !== 'admin') throw new BadRequest('Give a new 6-digit PIN when making someone Jefe de Templo.');
    db.updateUser(target.id, fields);
    if (fields.pin_hash && target.id !== user.id) db.deleteUserSessions(target.id);
    if (fields.role || fields.team_id !== undefined) for (const c of clients) if (c.userId === target.id) c.res.write('event: reload\ndata: {}\n\n');
    return { user: publicUser(db.userById(target.id)) };
  }, { admin: true });
  route('DELETE', '/api/users/:id', ({ user, params }) => {
    if (params.id === user.id) throw new BadRequest('You can’t delete your own account.');
    db.deleteUser(params.id);
    for (const c of clients) if (c.userId === params.id) { c.res.end(); clients.delete(c); }
    return { ok: true };
  }, { admin: true });

  route('GET', '/api/export', ({ res }) => {
    const data = { app: 'church-status', version: VERSION, exportedAt: new Date().toISOString(), branches: db.docs('branches'), teams: db.docs('teams'), members: db.docs('members') };
    const day = new Date().toISOString().slice(0, 10);
    send(res, 200, JSON.stringify(data, null, 2), { 'Content-Disposition': `attachment; filename="church-status-backup-${day}.json"` });
  }, { admin: true, raw: true });
  route('POST', '/api/import', ({ body }) => { replaceAll(body); return { ok: true }; }, { admin: true, limit: 20e6 });

  route('GET', '/api/events', ({ user, req, res }) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    const client = { res, userId: user.id };
    clients.add(client);
    req.on('close', () => clients.delete(client));
  }, { raw: true });

  async function handleApi(req, res, url) {
    const match = routes.map(r => r.method === req.method && url.pathname.match(r.re) && { r, m: url.pathname.match(r.re) }).find(Boolean);
    if (!match) return send(res, 404, { error: 'Not found.' });
    const { r, m } = match;
    try {
      // Basic protection against cross-site requests: writes must be JSON from this site.
      if (req.method !== 'GET') {
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) throw Object.assign(new Error('Cross-site request blocked.'), { status: 403 });
        if (!String(req.headers['content-type'] || '').includes('application/json')) throw Object.assign(new Error('Send JSON.'), { status: 415 });
      }
      const user = sessionUser(req);
      if (r.auth !== false && !user) throw Object.assign(new Error('Please sign in.'), { status: 401 });
      if (r.admin && user.role !== 'admin') throw Object.assign(new Error('Only the Jefe de Templo can do this.'), { status: 403 });
      const body = req.method === 'GET' ? {} : await readBody(req, r.limit || 1e6);
      const params = Object.fromEntries(Object.entries(m.groups || {}).map(([k, v]) => [k, decodeURIComponent(v)]));
      const out = await r.handler({ req, res, user, body, params, url });
      if (!r.raw) send(res, 200, out);
    } catch (e) {
      const status = e.status || (e instanceof BadRequest ? 400 : 500);
      if (status === 500) log('Error:', e);
      if (!res.headersSent) send(res, status, { error: translate(status === 500 ? 'Something went wrong on the server.' : e.message, req.headers['x-lang']) });
    }
  }

  function serveStatic(req, res, url) {
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || !path.extname(rel)) rel = '/index.html';
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
      const ext = path.extname(file);
      res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300', ...SECURITY_HEADERS });
      res.end(buf);
    });
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') return send(res, 200, { ok: true });
    if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serveStatic(req, res, url);
  });
  server.on('close', () => db.close());
  return { server, db };
}

module.exports = { createApp };

if (require.main === module) {
  const port = +(process.env.PORT || 8080);
  const dbFile = process.env.DB_FILE || path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'church-status.db');
  const { server } = createApp({ dbFile, secureCookies: process.env.SECURE_COOKIES === 'true' });
  server.listen(port, () => console.log(`Church Status ${VERSION} running on http://localhost:${port} (data: ${dbFile})`));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
