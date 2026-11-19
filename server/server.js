'use strict';
// Church Status server: JSON API, live updates (Server-Sent Events) and the web app.
// No outside packages: Node's built-in HTTP server, crypto and SQLite.
//
// Access works with codes, not personal accounts:
//   - The app code (default 1925) opens the region results, monthly reports, the teams overview and settings.
//   - Each team has its own code, and each group a code that opens all of its teams.
//     A team's members and adjustments open only with the team's or its group's code.
process.removeAllListeners('warning');
process.on('warning', w => { if (w.name !== 'ExperimentalWarning') console.warn(w); });

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { openDatabase } = require('./db');
const { COLS, ID, BadRequest, clean, merge, denyReason, teamStats, emptyData, exampleData, isPlainObject } = require('./data');
const { translate } = require('./i18n');
const { readXlsx, parseDirectory, norm } = require('./excel');

const VERSION = require('../package.json').version;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SESSION_DAYS = 30;
const COOKIE = 'cs_session';
const CODE = { min: 4, max: 8 };

/* ---------------- helpers ---------------- */
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const monthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const fail = (status, message) => Object.assign(new Error(message), { status });

function checkCode(code) {
  if (typeof code !== 'string' || !/^\d+$/.test(code)) throw new BadRequest('The code can only have numbers.');
  if (code.length < CODE.min || code.length > CODE.max) throw new BadRequest(`The code needs ${CODE.min} to ${CODE.max} digits.`);
}
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
function createApp({ dbFile, secureCookies = false, mainCode = '1925', log = console.log } = {}) {
  const db = openDatabase(dbFile);
  const clients = new Set();
  const attempts = new Map();
  let failedAll = { n: 0, reset: Date.now() + 15 * 60e3 };

  // Codes are stored as a keyed hash (HMAC-SHA256 with a random secret kept in the database).
  let secret = db.getSetting('code_secret');
  if (!secret) { secret = crypto.randomBytes(32).toString('hex'); db.putSetting('code_secret', secret); }
  const codeHash = code => crypto.createHmac('sha256', secret).update(String(code)).digest('hex');
  if (!db.getSetting('main_code')) { checkCode(mainCode); db.putSetting('main_code', codeHash(mainCode)); }
  if (db.isEmpty() && !db.getSetting('seeded')) { seed(emptyData()); db.putSetting('seeded', '1'); }

  // Team codes are stored under the team id, group codes under "g:<group id>".
  function codeInUse(code, exceptKey) {
    const h = codeHash(code);
    if (h === db.getSetting('main_code')) return true;
    const k = db.teamByCode(h);
    return !!k && k !== exceptKey;
  }
  function opener(s) {
    const teams = db.docs('teams');
    return teamId => s.teams.includes(teamId) || (!!teams[teamId] && s.groups.includes(teams[teamId].groupId));
  }

  /* sessions */
  function getSession(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (!token) return null;
    const s = db.session(sha256(token));
    if (!s || s.expires < Date.now()) return null;
    const known = new Set(Object.keys(db.docs('teams'))), knownGroups = new Set(Object.keys(db.docs('groups')));
    s.teams = s.teams.filter(t => known.has(t));
    s.groups = s.groups.filter(g => knownGroups.has(g));
    s.opens = opener(s);
    return s;
  }
  function startSession(res, access) {
    const token = crypto.randomBytes(32).toString('base64url');
    db.insertSession(sha256(token), access, Date.now() + SESSION_DAYS * 864e5);
    db.purgeSessions();
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secureCookies ? '; Secure' : ''}`);
  }
  const publicAccess = s => ({ main: s.main, teams: s.teams, groups: s.groups });

  /* guessing limit for codes */
  function checkAttempts(req) {
    const ip = req.socket.remoteAddress || 'x', now = Date.now();
    const a = attempts.get(ip) || { n: 0, reset: now + 15 * 60e3 };
    if (now > a.reset) { a.n = 0; a.reset = now + 15 * 60e3; }
    if (now > failedAll.reset) failedAll = { n: 0, reset: now + 15 * 60e3 };
    if (a.n >= 8 || failedAll.n >= 40) throw fail(429, 'Too many wrong codes. Wait 15 minutes and try again.');
    return {
      async wrong() { a.n++; attempts.set(ip, a); failedAll.n++; await new Promise(r => setTimeout(r, 400)); throw fail(401, 'That code isn’t right.'); },
      ok() { attempts.delete(ip); },
    };
  }

  /* what a session may read */
  const currentMonth = () => monthKey(new Date());
  function visibleData(s) {
    const teams = db.docs('teams'), members = db.docs('members'), opens = opener(s);
    const visible = {};
    for (const [id, m] of Object.entries(members)) if (opens(m.teamId)) visible[id] = m;
    const coded = s.main ? db.teamsWithCodes() : [];
    return {
      branches: db.docs('branches'), groups: db.docs('groups'), teams, members: visible,
      teamStats: teamStats(teams, members, currentMonth()), month: currentMonth(),
      teamsWithCodes: s.main ? coded.filter(k => !k.startsWith('g:')) : undefined,
      groupsWithCodes: s.main ? coded.filter(k => k.startsWith('g:')).map(k => k.slice(2)) : undefined,
    };
  }

  /* live updates */
  function eachClient(fn) {
    for (const c of clients) {
      const s = db.session(c.tokenHash);
      if (!s || s.expires < Date.now()) { c.res.end(); clients.delete(c); continue; }
      fn(c, s);
    }
  }
  function broadcast(col, id, before, after) {
    eachClient((c, s) => {
      const opens = opener(s);
      const see = d => d && (col !== 'members' || opens(d.teamId));
      if (see(after)) c.res.write(`event: doc\ndata: ${JSON.stringify({ col, id, data: after })}\n\n`);
      else if (see(before)) c.res.write(`event: doc\ndata: ${JSON.stringify({ col, id, data: null })}\n\n`);
    });
    if (col === 'members' || col === 'teams') {
      const stats = teamStats(db.docs('teams'), db.docs('members'), currentMonth());
      eachClient(c => c.res.write(`event: stats\ndata: ${JSON.stringify(stats)}\n\n`));
    }
  }
  function broadcastReload() { eachClient(c => c.res.write('event: reload\ndata: {}\n\n')); }
  setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 25000).unref();

  function writeDoc(access, col, id, op, data) {
    if (!COLS.includes(col)) throw new BadRequest('Unknown record type.');
    if (!ID.test(id)) throw new BadRequest('Invalid record id.');
    if (!['set', 'update', 'delete'].includes(op)) throw new BadRequest('Unknown operation.');
    const existing = db.doc(col, id);
    if (op === 'delete') {
      if (!existing) return null;
      const reason = denyReason(access, col, op, { ...existing, __id: id }, null);
      if (reason) throw fail(403, reason);
      db.transaction(() => {
        db.deleteDoc(col, id);
        const dropTeam = tid => {
          const t = db.doc('teams', tid);
          for (const [mid, m] of Object.entries(db.docs('members'))) if (m.teamId === tid) { db.deleteDoc('members', mid); broadcast('members', mid, m, null); }
          db.deleteTeamCode(tid);
          if (t && tid !== id) { db.deleteDoc('teams', tid); broadcast('teams', tid, t, null); }
        };
        const dropGroup = gid => {
          const g = db.doc('groups', gid);
          for (const [tid, t] of Object.entries(db.docs('teams'))) if (t.groupId === gid) dropTeam(tid);
          db.deleteTeamCode('g:' + gid);
          if (g && gid !== id) { db.deleteDoc('groups', gid); broadcast('groups', gid, g, null); }
        };
        if (col === 'teams') dropTeam(id);
        if (col === 'groups') dropGroup(id);
        if (col === 'branches') {
          for (const [gid, g] of Object.entries(db.docs('groups'))) if (g.branchId === id) dropGroup(gid);
          for (const [tid, t] of Object.entries(db.docs('teams'))) if (t.branchId === id) dropTeam(tid);
        }
      });
      broadcast(col, id, existing, null);
      return null;
    }
    const cleaned = clean(col, data, op === 'update');
    if (op === 'update' && !existing) throw Object.assign(new BadRequest('That record no longer exists.'), { status: 404 });
    if (op === 'set' && existing && col === 'teams' && !access.main) throw fail(403, 'This needs the app code.');
    const next = op === 'set' ? cleaned : merge(existing, cleaned);
    if (op === 'update') clean(col, next, false);
    const reason = denyReason(access, col, existing ? 'update' : 'set', existing && { ...existing, __id: id }, op === 'set' ? next : cleaned);
    if (reason) throw fail(403, reason);
    if (col === 'members' && existing && op === 'set' && next.teamId !== existing.teamId) throw fail(403, 'A member can’t be moved to another team here.');
    if (col === 'branches' && next.hasTeams && !existing?.hasTeams) {
      // Only one branch reports through teams.
      for (const [bid, b] of Object.entries(db.docs('branches'))) if (bid !== id && b.hasTeams) { const nb = { ...b, hasTeams: false }; db.putDoc('branches', bid, nb); broadcast('branches', bid, b, nb); }
    }
    db.putDoc(col, id, next);
    broadcast(col, id, existing, next);
    return next;
  }

  function seed(data) {
    db.transaction(() => {
      for (const col of COLS) { db.deleteCol(col); for (const [id, doc] of Object.entries(data[col])) db.putDoc(col, id, doc); }
      db.clearTeamCodes();
      for (const [tid, code] of Object.entries(data.teamCodes || {})) if (!codeInUse(code)) db.putTeamCode(tid, codeHash(code));
    });
  }
  function replaceAll(data) {
    if (data.groups === undefined) data = { ...data, groups: {} };
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
      // Codes are kept for teams and groups that still exist.
      for (const k of db.teamsWithCodes()) if (k.startsWith('g:') ? !cleaned.groups[k.slice(2)] : !cleaned.teams[k]) db.deleteTeamCode(k);
    });
    broadcastReload();
  }

  /* Excel import: branches → groups → teams → members.
     mode "preview" only reads the file; "merge" adds and updates (keeps goals, codes and anyone
     added in the app); "replace" first removes all groups, teams and members. */
  function importExcel(body) {
    if (typeof body.file !== 'string' || !body.file) throw new BadRequest('Choose an Excel file.');
    let parsed;
    try { parsed = parseDirectory(readXlsx(Buffer.from(body.file, 'base64'))); }
    catch (e) { throw new BadRequest('That file couldn’t be read as an Excel (.xlsx) file.'); }
    if (!parsed.branches.length) throw new BadRequest('No teams were found. Each team needs a heading like “EQUIPO 1”.');
    const mode = ['merge', 'replace'].includes(body.mode) ? body.mode : 'preview';
    const summary = parsed.branches.map(b => ({
      name: b.name, groups: b.groups.length, teams: b.groups.reduce((a, g) => a + g.teams.length, 0),
      members: b.groups.reduce((a, g) => a + g.teams.reduce((x, t) => x + t.members.length, 0), 0),
    }));
    if (mode === 'preview') return { summary, warnings: parsed.warnings, skipped: parsed.skipped };

    const stats = { branchesAdded: 0, groupsAdded: 0, teamsAdded: 0, membersAdded: 0, membersUpdated: 0 };
    db.transaction(() => {
      if (mode === 'replace') {
        for (const col of ['groups', 'teams', 'members']) db.deleteCol(col);
        for (const k of db.teamsWithCodes()) db.deleteTeamCode(k);
      }
      const branches = db.docs('branches'), groups = db.docs('groups'), teams = db.docs('teams'), members = db.docs('members');
      const used = new Set(Object.keys({ ...branches, ...groups, ...teams, ...members }));
      const newId = base => { let id = base.slice(0, 60), n = 2; while (used.has(id)) id = `${base.slice(0, 56)}-${n++}`; used.add(id); return id; };
      const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
      let order = Object.values(branches).reduce((a, b) => Math.max(a, b.order ?? 0), -1);
      for (const b of parsed.branches) {
        let branchId = Object.keys(branches).find(id => norm(branches[id].name) === norm(b.name));
        if (!branchId) {
          branchId = newId(slug(b.name));
          branches[branchId] = { name: b.name, order: ++order, hasTeams: true, goals: { simple: 0, mean: 0, att: 0, tithe: 0, fruit: 0 }, months: {} };
          db.putDoc('branches', branchId, branches[branchId]); stats.branchesAdded++;
        }
        b.groups.forEach((g, gi) => {
          let groupId = Object.keys(groups).find(id => groups[id].branchId === branchId && norm(groups[id].name) === norm(g.name));
          if (!groupId) { groupId = newId(`${branchId}-g${gi + 1}`); stats.groupsAdded++; }
          groups[groupId] = { ...(groups[groupId] || {}), branchId, name: g.name, leader: groups[groupId]?.leader || g.leader, order: gi, future: !!g.future };
          db.putDoc('groups', groupId, clean('groups', groups[groupId], false));
          for (const t of g.teams) {
            let teamId = Object.keys(teams).find(id => teams[id].groupId === groupId && teams[id].num === t.num);
            const lead = t.members.find(m => m.leader);
            if (!teamId) {
              teamId = newId(`${groupId}-e${t.num}`); stats.teamsAdded++;
              teams[teamId] = { branchId, groupId, name: '', num: t.num, note: t.note, leader: lead ? lead.name : '', fruitGoal: 0, attTarget: 4, fruit: {} };
            } else {
              teams[teamId] = { ...teams[teamId], branchId, groupId, note: t.note || teams[teamId].note || '', leader: teams[teamId].leader || (lead ? lead.name : '') };
            }
            db.putDoc('teams', teamId, clean('teams', teams[teamId], false));
            for (const m of t.members) {
              const existing = Object.keys(members).find(id => members[id].teamId === teamId && norm(members[id].name) === norm(m.name));
              if (existing) {
                if (m.tag && members[existing].tag !== m.tag) { members[existing] = { ...members[existing], tag: m.tag }; db.putDoc('members', existing, members[existing]); stats.membersUpdated++; }
              } else {
                const mid = newId(`m-${teamId}-${slug(m.name)}`.slice(0, 60));
                members[mid] = { teamId, name: m.name, tag: m.tag, phone: '', notes: '', months: {} };
                db.putDoc('members', mid, clean('members', members[mid], false)); stats.membersAdded++;
              }
            }
          }
        });
      }
    });
    broadcastReload();
    log(`Excel import (${mode}): ${JSON.stringify(stats)}`);
    return { summary, warnings: parsed.warnings, skipped: parsed.skipped, stats };
  }

  /* routes */
  const routes = [];
  const route = (method, pattern, handler, opts = {}) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler, ...opts });

  route('GET', '/api/status', () => ({ version: VERSION }), { auth: false });

  // Enter with the app code (everything except team pages), or with a team code (that team plus the region results).
  route('POST', '/api/login', async ({ req, body, res }) => {
    const guard = checkAttempts(req);
    const code = typeof body.code === 'string' && /^\d{4,8}$/.test(body.code) ? body.code : null;
    const h = code && codeHash(code);
    let access = null;
    const key = h && db.teamByCode(h);
    if (h && h === db.getSetting('main_code')) access = { main: true, teams: [], groups: [] };
    else if (key && key.startsWith('g:')) access = { main: false, teams: [], groups: [key.slice(2)] };
    else if (key) access = { main: false, teams: [key], groups: [] };
    if (!access) await guard.wrong();
    guard.ok();
    startSession(res, access);
    return { access };
  }, { auth: false });

  // Open one team with its code, added to the current session.
  route('POST', '/api/unlock', async ({ req, body, session }) => {
    const guard = checkAttempts(req);
    const teamId = String(body.teamId || '');
    const code = typeof body.code === 'string' && /^\d{4,8}$/.test(body.code) ? body.code : null;
    const team = db.doc('teams', teamId);
    const key = code && db.teamByCode(codeHash(code));
    if (!team || !key || (key !== teamId && key !== 'g:' + team.groupId)) await guard.wrong();
    guard.ok();
    if (key.startsWith('g:')) { if (!session.groups.includes(team.groupId)) session.groups.push(team.groupId); }
    else if (!session.teams.includes(teamId)) session.teams.push(teamId);
    db.updateSession(session.tokenHash, session);
    return { access: publicAccess(session) };
  });

  route('POST', '/api/logout', ({ req, res }) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) db.deleteSession(sha256(token));
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookies ? '; Secure' : ''}`);
    return { ok: true };
  }, { auth: false });

  route('GET', '/api/me', ({ session }) => ({ access: publicAccess(session) }));
  route('GET', '/api/data', ({ session }) => visibleData(session));
  route('POST', '/api/docs/:col/:id', ({ session, params, body }) => ({ data: writeDoc(session, params.col, params.id, body.op, body.data) }));

  // Codes: the app code holder manages all codes; a team can change its own code.
  route('POST', '/api/codes/main', ({ body }) => {
    checkCode(body.code);
    if (codeInUse(body.code) && codeHash(body.code) !== db.getSetting('main_code')) throw fail(409, 'A team already uses that code. Choose a different one.');
    db.putSetting('main_code', codeHash(body.code));
    return { ok: true };
  }, { main: true });
  route('POST', '/api/codes/group/:id', ({ session, params, body }) => {
    const groupId = params.id;
    if (!db.doc('groups', groupId)) throw fail(404, 'That group doesn’t exist.');
    if (!session.main && !session.groups.includes(groupId)) throw fail(403, 'This needs the app code.');
    checkCode(body.code);
    if (codeInUse(body.code, 'g:' + groupId)) throw fail(409, 'That code is already in use. Choose a different one.');
    db.putTeamCode('g:' + groupId, codeHash(body.code));
    return { ok: true };
  });
  // Gives a new random 4-digit code to every group that has none (or to all of them). All teams in a
  // group share its code; teams outside any group get their own.
  // This response is the only time the new codes can be seen, so the app shows them to print or copy.
  route('POST', '/api/codes/generate', ({ body }) => {
    const have = new Set(db.teamsWithCodes());
    const out = [];
    const make = () => { for (let i = 0; i < 500; i++) { const c = String(crypto.randomInt(1000, 10000)); if (!/^(\d)\1+$/.test(c) && !codeInUse(c)) return c; } throw fail(500, 'Could not find a free code.'); };
    db.transaction(() => {
      for (const [gid] of Object.entries(db.docs('groups'))) if (body.all || !have.has('g:' + gid)) { const c = make(); db.putTeamCode('g:' + gid, codeHash(c)); out.push({ kind: 'group', id: gid, code: c }); }
      const groups = db.docs('groups');
      for (const [tid, t] of Object.entries(db.docs('teams'))) if (!groups[t.groupId] && (body.all || !have.has(tid))) { const c = make(); db.putTeamCode(tid, codeHash(c)); out.push({ kind: 'team', id: tid, code: c }); }
    });
    return { codes: out };
  }, { main: true });
  route('POST', '/api/codes/team/:id', ({ session, params, body }) => {
    const teamId = params.id;
    if (!db.doc('teams', teamId)) throw fail(404, 'That team doesn’t exist.');
    if (!session.main && !opener(session)(teamId)) throw fail(403, 'Enter this team’s code first.');
    checkCode(body.code);
    if (codeInUse(body.code, teamId)) throw fail(409, 'That code is already in use. Choose a different one.');
    db.putTeamCode(teamId, codeHash(body.code));
    return { ok: true };
  });

  route('GET', '/api/export', ({ res }) => {
    const data = { app: 'church-status', version: VERSION, exportedAt: new Date().toISOString(), branches: db.docs('branches'), groups: db.docs('groups'), teams: db.docs('teams'), members: db.docs('members') };
    send(res, 200, JSON.stringify(data, null, 2), { 'Content-Disposition': `attachment; filename="church-status-backup-${new Date().toISOString().slice(0, 10)}.json"` });
  }, { main: true, raw: true });
  route('POST', '/api/import', ({ body }) => { replaceAll(body); return { ok: true }; }, { main: true, limit: 20e6 });
  route('POST', '/api/import-excel', ({ body }) => importExcel(body), { main: true, limit: 30e6 });
  route('POST', '/api/example', ({ body }) => {
    seed(body.empty ? emptyData() : exampleData());
    broadcastReload();
    return { ok: true };
  }, { main: true });

  route('GET', '/api/events', ({ session, req, res }) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    const client = { res, tokenHash: session.tokenHash };
    clients.add(client);
    req.on('close', () => clients.delete(client));
  }, { raw: true });

  async function handleApi(req, res, url) {
    const found = routes.find(r => r.method === req.method && r.re.test(url.pathname));
    if (!found) return send(res, 404, { error: 'Not found.' });
    try {
      // Basic protection against cross-site requests: writes must be JSON from this site.
      if (req.method !== 'GET') {
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) throw fail(403, 'Cross-site request blocked.');
        if (!String(req.headers['content-type'] || '').includes('application/json')) throw fail(415, 'Send JSON.');
      }
      const session = getSession(req);
      if (found.auth !== false && !session) throw fail(401, 'Please enter the code.');
      if (found.main && !session.main) throw fail(403, 'This needs the app code.');
      const body = req.method === 'GET' ? {} : await readBody(req, found.limit || 1e6);
      const params = Object.fromEntries(Object.entries(url.pathname.match(found.re).groups || {}).map(([k, v]) => [k, decodeURIComponent(v)]));
      const out = await found.handler({ req, res, session, body, params, url });
      if (!found.raw) send(res, 200, out);
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
  return { server };
}

module.exports = { createApp };

if (require.main === module) {
  const port = +(process.env.PORT || 8080);
  const dbFile = process.env.DB_FILE || path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'church-status.db');
  const { server } = createApp({ dbFile, secureCookies: process.env.SECURE_COOKIES === 'true', mainCode: process.env.APP_CODE || '1925' });
  server.listen(port, () => console.log(`Church Status ${VERSION} running on http://localhost:${port} (data: ${dbFile})`));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
