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

test('setup, PIN sign-in, roles and permissions', async t => {
  const { server, base } = await startServer();
  t.after(() => server.close());
  const admin = client(base);

  assert.equal((await admin('GET', '/api/status')).data.setup, true);
  assert.equal((await admin('GET', '/api/data')).status, 401);

  // Jefe de Templo PIN: exactly 6 digits, not one digit repeated
  assert.equal((await admin('POST', '/api/setup', { name: 'Jefe', pin: '1234' })).status, 400);
  assert.equal((await admin('POST', '/api/setup', { name: 'Jefe', pin: '777777' })).status, 400);
  assert.equal((await admin('POST', '/api/setup', { name: 'Jefe', pin: '12a456' })).status, 400);

  const setup = await admin('POST', '/api/setup', { name: 'Pastor Samuel', pin: '482915', example: true });
  assert.equal(setup.status, 200);
  assert.equal(setup.data.user.role, 'admin');
  assert.equal((await admin('GET', '/api/status')).data.setup, false);
  assert.equal((await admin('POST', '/api/setup', { name: 'X', pin: '135790' })).status, 409);

  const data = (await admin('GET', '/api/data')).data;
  assert.equal(Object.keys(data.branches).length, 5);
  assert.equal(Object.keys(data.teams).length, 5);
  assert.equal(Object.keys(data.members).length, 40);

  // Example team leaders exist and no PIN or hash is ever sent to the browser
  const users = (await admin('GET', '/api/users')).data.users;
  assert.ok(users.find(u => u.name === 'Ruben Gómez' && u.teamId === 't3'));
  assert.ok(users.every(u => !('pin' in u) && !('pin_hash' in u)));

  // Admin enters a monthly report
  const rep = await admin('POST', '/api/docs/branches/moca', { op: 'update', data: { months: { '2026-11': { simple: 99 } }, goals: { simple: 900 } } });
  assert.equal(rep.status, 200);
  assert.equal(rep.data.data.months['2026-11'].simple, 99);
  assert.equal(rep.data.data.goals.simple, 900);
  assert.equal((await admin('POST', '/api/docs/branches/moca', { op: 'update', data: { color: 'red' } })).status, 400);
  assert.equal((await admin('POST', '/api/docs/branches/moca', { op: 'update', data: { goals: { simple: -5 } } })).status, 400);

  // Team leader signs in with PIN 3333 and sees only their own members
  const leader = client(base);
  assert.equal((await leader('POST', '/api/login', { pin: '9999' })).status, 401);
  const login = await leader('POST', '/api/login', { pin: '3333' });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.teamId, 't3');
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

  // Leader changes their own PIN; a PIN someone else uses is refused
  assert.equal((await leader('POST', '/api/me/pin', { current: '0000', next: '8642' })).status, 400);
  assert.equal((await leader('POST', '/api/me/pin', { current: '3333', next: '1111' })).status, 409);
  assert.equal((await leader('POST', '/api/me/pin', { current: '3333', next: '8642' })).status, 200);
  assert.equal((await client(base)('POST', '/api/login', { pin: '3333' })).status, 401);
  assert.equal((await client(base)('POST', '/api/login', { pin: '8642' })).status, 200);

  // Admin adds a person, resets a PIN, export and restore round-trip
  const created = await admin('POST', '/api/users', { name: 'Nueva Líder', pin: '2468', role: 'leader', teamId: 't2' });
  assert.equal(created.status, 200);
  assert.equal((await admin('POST', '/api/users', { name: 'Dup', pin: '2468', role: 'leader' })).status, 409);
  assert.equal((await admin('POST', '/api/users', { name: 'Short', pin: '12', role: 'leader' })).status, 400);
  assert.equal((await admin('PATCH', `/api/users/${created.data.user.id}`, { pin: '13579' })).status, 200);
  assert.equal((await admin('PATCH', `/api/users/${created.data.user.id}`, { role: 'admin' })).status, 400);
  const exp = await admin('GET', '/api/export');
  assert.equal(exp.status, 200);
  assert.equal(exp.data.app, 'church-status');
  assert.equal((await admin('POST', '/api/import', { branches: exp.data.branches, teams: exp.data.teams, members: exp.data.members })).status, 200);

  // Removing a team removes its members and unlinks its leader
  assert.equal((await admin('POST', '/api/docs/teams/t2', { op: 'delete' })).status, 200);
  const after = (await admin('GET', '/api/data')).data;
  assert.ok(!Object.values(after.members).some(m => m.teamId === 't2'));
  assert.equal((await admin('GET', '/api/users')).data.users.find(u => u.name === 'Nueva Líder').teamId, null);

  // Sign out ends the session
  assert.equal((await leader('POST', '/api/logout', {})).status, 200);
  assert.equal((await leader('GET', '/api/me')).status, 401);
});

test('wrong PINs are limited', async t => {
  const { server, base } = await startServer();
  t.after(() => server.close());
  const c = client(base);
  await c('POST', '/api/setup', { name: 'Jefe', pin: '482915' });
  const guesser = client(base);
  const codes = [];
  for (let i = 0; i < 9; i++) codes.push((await guesser('POST', '/api/login', { pin: String(1000 + i) })).status);
  assert.deepEqual(codes.slice(0, 8), Array(8).fill(401));
  assert.equal(codes[8], 429);
  // Even the right PIN waits until the pause is over
  assert.equal((await guesser('POST', '/api/login', { pin: '482915' })).status, 429);
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
