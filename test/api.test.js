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
  assert.deepEqual(login.data.access, { main: true, teams: [], groups: [] });
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
  assert.deepEqual(un.data.access, { main: true, teams: ['t3'], groups: [] });
  data = (await main('GET', '/api/data')).data;
  const mine = Object.entries(data.members);
  assert.ok(mine.length === 8 && mine.every(([, m]) => m.teamId === 't3'));
  const [myId] = mine[0];
  assert.equal((await main('POST', `/api/docs/members/${myId}`, { op: 'update', data: { months: { '2026-11': { pr: 2 } } } })).status, 200);

  // A team code at the front door opens only that team (plus region results)
  const team = client(base);
  const tl = await team('POST', '/api/login', { code: '1111' });
  assert.deepEqual(tl.data.access, { main: false, teams: ['t1'], groups: [] });
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

test('Excel import, group codes and generated codes', async t => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { server, base } = await startServer();
  t.after(() => server.close());
  const main = client(base);
  await main('POST', '/api/login', { code: '1925' });
  const file = fs.readFileSync(path.join(__dirname, 'fixtures', 'directorio-ejemplo.xlsx')).toString('base64');

  // Preview changes nothing and reports what it found
  const pv = await main('POST', '/api/import-excel', { file, mode: 'preview' });
  assert.equal(pv.status, 200);
  assert.deepEqual(pv.data.summary.map(b => [b.name, b.groups, b.teams, b.members]), [['Santiago', 3, 5, 10], ['Moca', 1, 1, 1]]);
  assert.deepEqual(pv.data.skipped.sort(), ['Comités', 'Resumen General']);
  assert.ok(pv.data.warnings.some(w => /dos veces/.test(w)), 'duplicate name in one team is reported');
  assert.ok(pv.data.warnings.some(w => /se unieron al Equipo 1/.test(w)), 'a column without heading or count joins the team on its left');
  assert.equal(Object.keys((await main('GET', '/api/data')).data.teams).length, 0);
  assert.equal((await main('POST', '/api/import-excel', { file: 'bm90IGFuIGV4Y2Vs', mode: 'preview' })).status, 400);

  // Merge imports groups, teams, members, tags and team leaders
  const im = await main('POST', '/api/import-excel', { file, mode: 'merge' });
  assert.deepEqual(im.data.stats, { branchesAdded: 0, groupsAdded: 4, teamsAdded: 6, membersAdded: 11, membersUpdated: 0 });
  let d = (await main('GET', '/api/data')).data;
  const groups = Object.entries(d.groups);
  const ana = groups.find(([, g]) => g.name === 'Adultas · Ana Prueba');
  const future = groups.find(([, g]) => g.future);
  assert.equal(ana[1].leader, 'Ana Prueba');
  assert.equal(future[1].name, 'Futuro Grupo · Adultas · Ana Prueba');
  const anaTeams = Object.entries(d.teams).filter(([, tm]) => tm.groupId === ana[0]);
  assert.equal(anaTeams.length, 3);
  assert.equal(anaTeams.find(([, tm]) => tm.num === 1)[1].leader, 'Rosa Uno');
  assert.equal(Object.values(d.teams).find(tm => tm.groupId === future[0]).num, 4);

  // Importing again adds nothing twice; people added in the app stay
  const team1 = anaTeams.find(([, tm]) => tm.num === 1)[0];
  const gen = await main('POST', '/api/codes/generate', {});
  assert.equal(gen.status, 200);
  assert.equal(gen.data.codes.length, 4, 'one code per group');
  assert.ok(gen.data.codes.every(c => c.kind === 'group'));
  assert.ok(gen.data.codes.every(c => /^\d{4}$/.test(c.code)));
  assert.equal(new Set(gen.data.codes.map(c => c.code)).size, gen.data.codes.length, 'codes are unique');
  assert.equal((await main('POST', '/api/codes/generate', {})).data.codes.length, 0, 'nothing left without a code');
  const groupCode = gen.data.codes.find(c => c.kind === 'group' && c.id === ana[0]).code;
  const leader = client(base);
  const gl = await leader('POST', '/api/login', { code: groupCode });
  assert.deepEqual(gl.data.access, { main: false, teams: [], groups: [ana[0]] });
  const ld = (await leader('GET', '/api/data')).data;
  assert.equal(Object.keys(ld.members).length, 6, 'group code sees its 3 teams’ members');
  assert.equal((await leader('POST', '/api/docs/members/new-1', { op: 'set', data: { teamId: team1, name: 'Persona Nueva', months: {} } })).status, 200);
  const otherTeam = Object.entries(d.teams).find(([, tm]) => tm.groupId !== ana[0])[0];
  assert.equal((await leader('POST', '/api/docs/members/new-2', { op: 'set', data: { teamId: otherTeam, name: 'X', months: {} } })).status, 403);
  assert.equal((await leader('POST', '/api/docs/groups/' + ana[0], { op: 'update', data: { name: 'Mío' } })).status, 403);
  const again = await main('POST', '/api/import-excel', { file, mode: 'merge' });
  assert.deepEqual(again.data.stats, { branchesAdded: 0, groupsAdded: 0, teamsAdded: 0, membersAdded: 0, membersUpdated: 0 });
  d = (await main('GET', '/api/data')).data;
  assert.equal(d.groupsWithCodes.length, 4, 'codes survive a re-import');

  // The app code opens a team with that group's code too
  const un = await main('POST', '/api/unlock', { teamId: team1, code: groupCode });
  assert.deepEqual(un.data.access.groups, [ana[0]]);
  assert.ok(Object.values((await main('GET', '/api/data')).data.members).some(m => m.name === 'Persona Nueva'));

  // Replace starts over: codes and app-added people are gone
  const rep = await main('POST', '/api/import-excel', { file, mode: 'replace' });
  assert.equal(rep.data.stats.membersAdded, 11);
  d = (await main('GET', '/api/data')).data;
  assert.equal(d.teamsWithCodes.length + d.groupsWithCodes.length, 0);
  assert.equal((await client(base)('POST', '/api/login', { code: groupCode })).status, 401);

  // Removing a group removes its teams and members
  const g2 = Object.entries(d.groups).find(([, g]) => g.name === 'Adultas · Ana Prueba')[0];
  assert.equal((await main('POST', '/api/docs/groups/' + g2, { op: 'delete' })).status, 200);
  d = (await main('GET', '/api/data')).data;
  assert.ok(!Object.values(d.teams).some(tm => tm.groupId === g2));
});
