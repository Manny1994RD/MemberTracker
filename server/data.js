'use strict';
// What each record may contain, who may change it, and the starting data.

const COLS = ['branches', 'teams', 'members'];
const FIELDS = {
  branches: { name: 'str', order: 'num', hasTeams: 'bool', goals: 'nums', months: 'monthNums' },
  teams: { name: 'str', num: 'num', leader: 'str', fruitGoal: 'num', attTarget: 'num', fruit: 'nums' },
  members: { teamId: 'str', name: 'str', phone: 'str', notes: 'text', months: 'monthNums' },
};
const LEADER_TEAM_FIELDS = ['name', 'attTarget', 'fruit'];
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

class BadRequest extends Error {}

function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function checkNum(v, where) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1e7) throw new BadRequest(`${where} must be a number from 0 to 10,000,000`);
  return Math.round(v * 100) / 100;
}
function checkNums(obj, where) {
  if (!isPlainObject(obj)) throw new BadRequest(`${where} must be an object`);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(k)) throw new BadRequest(`${where} has an invalid key`);
    out[k] = v === null ? null : checkNum(v, `${where}.${k}`);
  }
  return out;
}

// Validates a full or partial record. Returns a cleaned copy.
function clean(col, data, partial) {
  if (!isPlainObject(data)) throw new BadRequest('data must be an object');
  const spec = FIELDS[col];
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    const type = spec[key];
    if (!type) throw new BadRequest(`unknown field "${key}"`);
    switch (type) {
      case 'str':
        if (typeof value !== 'string' || value.length > 120) throw new BadRequest(`${key} must be text up to 120 characters`);
        out[key] = value.trim(); break;
      case 'text':
        if (typeof value !== 'string' || value.length > 2000) throw new BadRequest(`${key} must be text up to 2000 characters`);
        out[key] = value; break;
      case 'num': out[key] = checkNum(value, key); break;
      case 'bool':
        if (typeof value !== 'boolean') throw new BadRequest(`${key} must be true or false`);
        out[key] = value; break;
      case 'nums': out[key] = checkNums(value, key); break;
      case 'monthNums': {
        if (!isPlainObject(value)) throw new BadRequest(`${key} must be an object`);
        const months = {};
        for (const [m, v] of Object.entries(value)) {
          if (!MONTH_KEY.test(m)) throw new BadRequest(`${key} has an invalid month "${m}"`);
          months[m] = v === null ? null : checkNums(v, `${key}.${m}`);
        }
        out[key] = months; break;
      }
    }
  }
  if (!partial && col === 'members' && !out.teamId) throw new BadRequest('a member needs a team');
  if (!partial && !out.name && col !== 'teams') throw new BadRequest('name is required');
  return out;
}

// Deep merge; a null value removes the key.
function merge(base, patch) {
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else if (isPlainObject(v)) out[k] = merge(out[k], v);
    else out[k] = v;
  }
  return out;
}

// Who may write what. Returns an error message, or null when allowed.
function denyReason(user, col, op, existing, next) {
  if (user.role === 'admin') return null;
  if (col === 'branches') return 'Only the Jefe de Templo can change branch reports.';
  if (col === 'teams') {
    if (op !== 'update' || !existing) return 'Only the Jefe de Templo can add or remove teams.';
    if (user.team_id !== existing.__id) return 'You can only change your own team.';
    const bad = Object.keys(next).filter(k => !LEADER_TEAM_FIELDS.includes(k));
    if (bad.length) return 'Only the Jefe de Templo can change the fruit goal or the team leader.';
    return null;
  }
  if (col === 'members') {
    if (existing && existing.teamId !== user.team_id) return 'You can only change members of your own team.';
    if (next && next.teamId !== undefined && next.teamId !== user.team_id) return 'You can only add members to your own team.';
    if (!user.team_id) return 'Your account isn’t linked to a team yet.';
    return null;
  }
  return 'Not allowed.';
}

const BRANCHES = [
  ['santiago', 'Santiago', true],
  ['la-vega', 'La Vega', false],
  ['moca', 'Moca', false],
  ['puerto-plata', 'Puerto Plata', false],
  ['jarabacoa', 'Jarabacoa', false],
];

function emptyData() {
  const branches = {};
  BRANCHES.forEach(([id, name, hasTeams], order) => {
    branches[id] = { name, order, hasTeams, goals: { simple: 0, mean: 0, att: 0, tithe: 0, fruit: 0 }, months: {} };
  });
  return { branches, teams: {}, members: {} };
}

// Example data for trying the app. Deterministic, dated to the current year.
function exampleData(now = new Date()) {
  let seed = 11;
  const r = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const year = now.getFullYear(), curMonth = now.getMonth() + 1;
  const months = Array.from({ length: curMonth }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const current = months[months.length - 1];
  const goalsBy = {
    santiago: [{ simple: 1200, mean: 300, att: 300, tithe: 95, fruit: 15 }, 1.0],
    'la-vega': [{ simple: 900, mean: 220, att: 220, tithe: 80, fruit: 12 }, .86],
    moca: [{ simple: 800, mean: 200, att: 200, tithe: 70, fruit: 12 }, .78],
    'puerto-plata': [{ simple: 700, mean: 180, att: 160, tithe: 60, fruit: 11 }, .64],
    jarabacoa: [{ simple: 600, mean: 150, att: 140, tithe: 50, fruit: 10 }, .5],
  };
  const { branches } = emptyData();
  for (const [id, b] of Object.entries(branches)) {
    const [goals, perf] = goalsBy[id];
    b.goals = goals;
    let acc = 0, prev = 0;
    months.forEach(m => {
      acc += goals.fruit * perf / 12 * (.6 + r() * .8);
      const fruit = Math.floor(acc) - prev; prev = Math.floor(acc);
      const v = {
        simple: Math.round(goals.simple / 12 * perf * (.85 + r() * .3)),
        mean: Math.round(goals.mean / 12 * perf * (.85 + r() * .3)),
        att: Math.round(goals.att * Math.min(1, perf + .08) * (.9 + r() * .1)),
        tithe: Math.round(goals.tithe * Math.min(1, perf + .06) * (.9 + r() * .1)),
      };
      if (!b.hasTeams) v.fruit = fruit;
      b.months[m] = v;
    });
  }
  const teams = {}, members = {};
  const T = [
    ['t1', 'Monte Sion', 1, 'Elena Vargas', 4, .95, 4, 4],
    ['t2', 'Luz del Mundo', 2, 'Pedro Santos', 3, .88, 4, 3],
    ['t3', 'Los Valientes', 3, 'Ruben Gómez', 3, .8, 4, 2],
    ['t4', '', 4, 'Ana Castillo', 3, .7, 2, 3],
    ['t5', 'Sal de la Tierra', 5, 'Marco Díaz', 2, .55, 4, 1],
  ];
  const perfs = {};
  T.forEach(([id, name, num, leader, fruitGoal, perf, attTarget, done]) => {
    const fruit = {};
    [...months].sort(() => r() - .5).slice(0, done).forEach(m => { fruit[m] = (fruit[m] || 0) + 1; });
    teams[id] = { name, num, leader, fruitGoal, attTarget, fruit };
    perfs[id] = perf;
  });
  const names = ['Ana Rodríguez', 'María López', 'Sofía Ramírez', 'Miguel Torres', 'Lucía Fernández', 'José Martínez', 'Carlos Méndez', 'Daniel Pérez', 'Rosa Jiménez',
    'Luis Castillo', 'Carmen Reyes', 'Jorge Herrera', 'Patricia Núñez', 'Andrés Polanco', 'Yolanda Peña', 'Ramón Batista',
    'Isabel Guzmán', 'Francisco Rosario', 'Teresa Almonte', 'Héctor Cruz', 'Marisol Tavárez', 'Víctor Durán', 'Elena Rojas', 'Pablo Santana',
    'Gabriela Ureña', 'Samuel Fermín', 'Natalia Abreu', 'Rafael Ventura', 'Diana Cabrera', 'Julio Mejía',
    'Altagracia Paulino', 'Félix Espinal', 'Ruth Encarnación', 'Manuel Holguín', 'Esther Vásquez', 'Tomás Lantigua', 'Noemí Sosa', 'Ángel Brito', 'Raquel Marte', 'Ismael Frías'];
  const sizes = { t1: 9, t2: 7, t3: 8, t4: 6, t5: 10 };
  let n = 0;
  for (const [tid, size] of Object.entries(sizes)) {
    const t = teams[tid];
    for (let i = 0; i < size; i++) {
      const p = perfs[tid] + (r() - .5) * .35;
      const hit = () => r() < p;
      const cnt = target => hit() ? target : Math.floor(r() * target);
      members['m' + String(++n).padStart(2, '0')] = {
        teamId: tid, name: names[n - 1], phone: '', notes: '',
        months: { [current]: { att: cnt(t.attTarget), tithe: hit() ? 1 : 0, edu: hit() ? 1 : 0, ga: hit() ? 1 : 0, om: cnt(3), pr: cnt(3), prep: hit() ? 1 : 0 } },
      };
    }
  }
  return { branches, teams, members };
}

module.exports = { COLS, ID, BadRequest, clean, merge, denyReason, emptyData, exampleData, isPlainObject };
