'use strict';
// API tests: run with `npm test` (Node's built-in test runner).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/server');

async function startServer() {
  const { server } = createApp({ dbFile: ':memory:', log: () => {} });
  await new Promise(r => server.listen(0, r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
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

test('app code, team codes and permissions', async t => {
  const { server, base } = await startServer();
  t.after(() => server.close());
  const main = client(base);

  // Starts with the 5 branches and no teams; nothing without a code
  assert.equal((await main('GET', '/api/data')).status, 401);
  assert.equal((await main('POST', '/api/login', { code: '0000' })).status, 401);
  const login = await main('POST', '/api/login', { code: '1925' });
  assert.equal(login.status, 200);
  assert.deepEqual(login.data.access, { main: true, teams: [] });
  let data = (await main('GET', '/api/data')).data;
  assert.equal(Object.keys(data.branches).length, 5);
  assert.equal(Object.keys(data.teams).length, 0);

  // Load example data (team codes 1111 … 5555)
  assert.equal((await main('POST', '/api/example', {})).status, 200);
  data = (await main('GET', '/api/data')).data;
  assert.equal(Object.keys(data.teams).length, 5);
  assert.equal(Object.keys(data.members).length, 0, 'the app code alone does not show members');
  assert.equal(data.teamStats.t3.members, 8);
  assert.ok(data.teamStats.t3.health > 0);
  assert.deepEqual(data.teamsWithCodes.sort(), ['t1', 't2', 't3', 't4', 't5']);

  // App code: monthly report yes, team members no
  const rep = await main('POST', '/api/docs/branches/moca', { op: 'update', data: { months: { '2026-11': { simple: 99 } }, goals: { simple: 900 } } });
  assert.equal(rep.status, 200);
  assert.equal(rep.data.data.months['2026-11'].simple, 99);
  assert.equal((await main('POST', '/api/docs/branches/moca', { op: 'update', data: { color: 'red' } })).status, 400);
  assert.equal((await main('POST', '/api/docs/members/x1', { op: 'set', data: { teamId: 't3', name: 'X', months: {} } })).status, 403);
  assert.equal((await main('POST', '/api/docs/teams/t3', { op: 'update', data: { fruitGoal: 4 } })).status, 200);

  // Opening a team needs its code
  assert.equal((await main('POST', '/api/unlock', { teamId: 't3', code: '1111' })).status, 401);
  const un = await main('POST', '/api/unlock', { teamId: 't3', code: '3333' });
  assert.equal(un.status, 200);
  assert.deepEqual(un.data.access, { main: true, teams: ['t3'] });
  data = (await main('GET', '/api/data')).data;
  const mine = Object.entries(data.members);
  assert.ok(mine.length === 8 && mine.every(([, m]) => m.teamId === 't3'));
  const [myId] = mine[0];
  assert.equal((await main('POST', `/api/docs/members/${myId}`, { op: 'update', data: { months: { '2026-11': { pr: 2 } } } })).status, 200);

  // A team code at the front door opens only that team (plus region results)
  const team = client(base);
  const tl = await team('POST', '/api/login', { code: '1111' });
  assert.deepEqual(tl.data.access, { main: false, teams: ['t1'] });
  const td = (await team('GET', '/api/data')).data;
  assert.ok(Object.values(td.members).every(m => m.teamId === 't1'));
  assert.equal(td.teamsWithCodes, undefined);
  const t1Member = Object.keys(td.members)[0];
  assert.equal((await team('POST', `/api/docs/members/${t1Member}`, { op: 'update', data: { months: { '2026-11': { tithe: 1 } } } })).status, 200);
  assert.equal((await team('POST', `/api/docs/members/${myId}`, { op: 'update', data: { name: 'Hacked' } })).status, 403);
  assert.equal((await team('POST', `/api/docs/members/${t1Member}`, { op: 'update', data: { teamId: 't3' } })).status, 403);
  assert.equal((await team('POST', '/api/docs/members/new1', { op: 'set', data: { teamId: 't1', name: 'Nuevo', months: {} } })).status, 200);
  assert.equal((await team('POST', '/api/docs/members/new1', { op: 'delete' })).status, 200);
  assert.equal((await team('POST', '/api/docs/teams/t1', { op: 'update', data: { name: 'Monte', attTarget: 3, fruit: { '2026-11': 1 } } })).status, 200);
  assert.equal((await team('POST', '/api/docs/teams/t1', { op: 'update', data: { fruitGoal: 9 } })).status, 403);
  assert.equal((await team('POST', '/api/docs/teams/t2', { op: 'update', data: { name: 'Mine' } })).status, 403);
  assert.equal((await team('POST', '/api/docs/branches/moca', { op: 'update', data: { goals: { simple: 1 } } })).status, 403);
  assert.equal((await team('GET', '/api/export')).status, 403);
  assert.equal((await team('POST', '/api/codes/main', { code: '4321' })).status, 403);

  // Codes: unique, a team can change its own, the app code holder can change any
  assert.equal((await team('POST', '/api/codes/team/t1', { code: '2222' })).status, 409);
  assert.equal((await team('POST', '/api/codes/team/t1', { code: '1925' })).status, 409);
  assert.equal((await team('POST', '/api/codes/team/t2', { code: '7777' })).status, 403);
  assert.equal((await team('POST', '/api/codes/team/t1', { code: '7531' })).status, 200);
  assert.equal((await client(base)('POST', '/api/login', { code: '1111' })).status, 401);
  assert.equal((await main('POST', '/api/codes/team/t2', { code: '12' })).status, 400);
  assert.equal((await main('POST', '/api/codes/team/t2', { code: '864200' })).status, 200);
  assert.equal((await main('POST', '/api/codes/main', { code: '864200' })).status, 409);
  assert.equal((await main('POST', '/api/codes/main', { code: '2025' })).status, 200);
  assert.equal((await client(base)('POST', '/api/login', { code: '1925' })).status, 401);
  assert.equal((await client(base)('POST', '/api/login', { code: '2025' })).status, 200);

  // Backup round-trip; removing a team removes its members and its code
  const exp = await main('GET', '/api/export');
  assert.equal(exp.data.app, 'church-status');
  assert.equal((await main('POST', '/api/import', { branches: exp.data.branches, teams: exp.data.teams, members: exp.data.members })).status, 200);
  assert.equal((await main('POST', '/api/docs/teams/t2', { op: 'delete' })).status, 200);
  assert.ok(!(await main('GET', '/api/data')).data.teamsWithCodes.includes('t2'));
  assert.equal((await client(base)('POST', '/api/login', { code: '864200' })).status, 401);

  // Locking ends the session
  assert.equal((await team('POST', '/api/logout', {})).status, 200);
  assert.equal((await team('GET', '/api/me')).status, 401);
});

test('wrong codes are limited', async t => {
  const { server, base } = await startServer();
  t.after(() => server.close());
  const guesser = client(base);
  const codes = [];
  for (let i = 0; i < 9; i++) codes.push((await guesser('POST', '/api/login', { code: String(3000 + i) })).status);
  assert.deepEqual(codes.slice(0, 8), Array(8).fill(401));
  assert.equal(codes[8], 429);
  assert.equal((await guesser('POST', '/api/login', { code: '1925' })).status, 429);
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
