'use strict';
// API tests: run with `npm test` (Node's built-in test runner).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/server');

async function startServer() {
  const { server } = createApp({ dbFile: ':memory:', log: () => {} });
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base };
}
function client(base) {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, data };
  };
}

test('setup, roles and permissions', async t => {
  const { server, base } = await startServer();
  t.after(() => server.close());
  const admin = client(base);

  assert.equal((await admin('GET', '/api/status')).data.setup, true);
  assert.equal((await admin('GET', '/api/data')).status, 401);

  const weak = await admin('POST', '/api/setup', { name: 'Jefe', username: 'jefe', password: 'short' });
  assert.equal(weak.status, 400);

  const setup = await admin('POST', '/api/setup', { name: 'Pastor Samuel', username: 'jefe', password: 'secreto123', example: true });
  assert.equal(setup.status, 200);
  assert.equal(setup.data.user.role, 'admin');
  assert.equal((await admin('GET', '/api/status')).data.setup, false);
  assert.equal((await admin('POST', '/api/setup', { name: 'X', username: 'xxx', password: 'secreto123' })).status, 409);

  const data = (await admin('GET', '/api/data')).data;
  assert.equal(Object.keys(data.branches).length, 5);
  assert.equal(Object.keys(data.teams).length, 5);
  assert.equal(Object.keys(data.members).length, 40);

  // Example leader logins exist
  const users = (await admin('GET', '/api/users')).data.users;
  assert.ok(users.find(u => u.username === 'lider3' && u.teamId === 't3'));

  // Admin enters a monthly report
  const rep = await admin('POST', '/api/docs/branches/moca', { op: 'update', data: { months: { '2026-11': { simple: 99 } }, goals: { simple: 900 } } });
  assert.equal(rep.status, 200);
  assert.equal(rep.data.data.months['2026-11'].simple, 99);
  assert.equal(rep.data.data.goals.simple, 900);
  assert.equal((await admin('POST', '/api/docs/branches/moca', { op: 'update', data: { color: 'red' } })).status, 400);
  assert.equal((await admin('POST', '/api/docs/branches/moca', { op: 'update', data: { goals: { simple: -5 } } })).status, 400);

  // Team leader: sees only own members, can update them, can't touch others
  const leader = client(base);
  assert.equal((await leader('POST', '/api/login', { username: 'lider3', password: 'wrong-pass' })).status, 401);
  assert.equal((await leader('POST', '/api/login', { username: 'LIDER3', password: 'secreto123' })).status, 200);
  const ld = (await leader('GET', '/api/data')).data;
  const mine = Object.entries(ld.members);
  assert.ok(mine.length === 8 && mine.every(([, m]) => m.teamId === 't3'));
  const [myId] = mine[0];
  const other = Object.entries(data.members).find(([, m]) => m.teamId === 't1')[0];

  assert.equal((await leader('POST', `/api/docs/members/${myId}`, { op: 'update', data: { months: { '2026-11': { pr: 2 } } } })).status, 200);
  assert.equal((await leader('POST', `/api/docs/members/${other}`, { op: 'update', data: { name: 'Hacked' } })).status, 403);
  assert.equal((await leader('POST', `/api/docs/members/${myId}`, { op: 'update', data: { teamId: 't1' } })).status, 403);
  assert.equal((await leader('POST', '/api/docs/members/new1', { op: 'set', data: { teamId: 't3', name: 'Nuevo Miembro', months: {} } })).status, 200);
  assert.equal((await leader('POST', '/api/docs/members/new2', { op: 'set', data: { teamId: 't1', name: 'Otro', months: {} } })).status, 403);
  assert.equal((await leader('POST', '/api/docs/members/new1', { op: 'delete' })).status, 200);
  assert.equal((await leader('POST', '/api/docs/teams/t3', { op: 'update', data: { name: 'Valientes', attTarget: 3, fruit: { '2026-11': 1 } } })).status, 200);
  assert.equal((await leader('POST', '/api/docs/teams/t3', { op: 'update', data: { fruitGoal: 99 } })).status, 403);
  assert.equal((await leader('POST', '/api/docs/teams/t1', { op: 'update', data: { name: 'Mine now' } })).status, 403);
  assert.equal((await leader('POST', '/api/docs/branches/moca', { op: 'update', data: { goals: { simple: 1 } } })).status, 403);
  assert.equal((await leader('GET', '/api/users')).status, 403);
  assert.equal((await leader('GET', '/api/export')).status, 403);

  // Leader changes own password
  assert.equal((await leader('POST', '/api/me/password', { current: 'nope', next: 'nuevaclave1' })).status, 400);
  assert.equal((await leader('POST', '/api/me/password', { current: 'secreto123', next: 'nuevaclave1' })).status, 200);

  // Admin creates a login, export and restore round-trip
  const created = await admin('POST', '/api/users', { name: 'Nueva Líder', username: 'nueva', password: 'clave12345', role: 'leader', teamId: 't2' });
  assert.equal(created.status, 200);
  assert.equal((await admin('POST', '/api/users', { name: 'Dup', username: 'NUEVA', password: 'clave12345' })).status, 409);
  const exp = await admin('GET', '/api/export');
  assert.equal(exp.status, 200);
  assert.equal(exp.data.app, 'church-status');
  assert.equal((await admin('POST', '/api/import', { branches: exp.data.branches, teams: exp.data.teams, members: exp.data.members })).status, 200);

  // Removing a team removes its members and unlinks its leader
  assert.equal((await admin('POST', '/api/docs/teams/t2', { op: 'delete' })).status, 200);
  const after = (await admin('GET', '/api/data')).data;
  assert.ok(!Object.values(after.members).some(m => m.teamId === 't2'));
  assert.equal((await admin('GET', '/api/users')).data.users.find(u => u.username === 'nueva').teamId, null);

  // Sign out ends the session
  assert.equal((await leader('POST', '/api/logout', {})).status, 200);
  assert.equal((await leader('GET', '/api/me')).status, 401);
});

test('blocks cross-site writes and non-JSON posts', async t => {
  const { server, base } = await startServer();
  t.after(() => server.close());
  const r1 = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' });
  assert.equal(r1.status, 403);
  const r2 = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' });
  assert.equal(r2.status, 415);
  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Church Status/);
  assert.equal((await fetch(base + '/../package.json')).status, 404);
});
