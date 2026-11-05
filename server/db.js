'use strict';
// SQLite storage, using Node's built-in driver (no native packages to compile).
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS team_codes (
      team_id TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS access_sessions (
      token_hash TEXT PRIMARY KEY,
      main INTEGER NOT NULL DEFAULT 0,
      teams TEXT NOT NULL DEFAULT '[]',
      expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS docs (
      col TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (col, id)
    );
  `);

  const q = {
    getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
    putSetting: db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'),
    teamByCode: db.prepare('SELECT team_id FROM team_codes WHERE code_hash = ?'),
    teamCodes: db.prepare('SELECT team_id FROM team_codes'),
    putTeamCode: db.prepare('INSERT INTO team_codes (team_id, code_hash) VALUES (?, ?) ON CONFLICT (team_id) DO UPDATE SET code_hash = excluded.code_hash'),
    deleteTeamCode: db.prepare('DELETE FROM team_codes WHERE team_id = ?'),
    clearTeamCodes: db.prepare('DELETE FROM team_codes'),
    insertSession: db.prepare('INSERT INTO access_sessions (token_hash, main, teams, expires) VALUES (?, ?, ?, ?)'),
    session: db.prepare('SELECT * FROM access_sessions WHERE token_hash = ?'),
    updateSession: db.prepare('UPDATE access_sessions SET main = ?, teams = ? WHERE token_hash = ?'),
    deleteSession: db.prepare('DELETE FROM access_sessions WHERE token_hash = ?'),
    purgeSessions: db.prepare('DELETE FROM access_sessions WHERE expires < ?'),
    docsByCol: db.prepare('SELECT id, data FROM docs WHERE col = ?'),
    doc: db.prepare('SELECT data FROM docs WHERE col = ? AND id = ?'),
    putDoc: db.prepare('INSERT INTO docs (col, id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'),
    deleteDoc: db.prepare('DELETE FROM docs WHERE col = ? AND id = ?'),
    deleteCol: db.prepare('DELETE FROM docs WHERE col = ?'),
    countDocs: db.prepare('SELECT COUNT(*) AS n FROM docs'),
  };

  const parseSession = row => row && { tokenHash: row.token_hash, main: !!row.main, teams: JSON.parse(row.teams), expires: row.expires };

  return {
    getSetting: key => q.getSetting.get(key)?.value ?? null,
    putSetting: (key, value) => q.putSetting.run(key, value),
    teamByCode: hash => q.teamByCode.get(hash)?.team_id ?? null,
    teamsWithCodes: () => q.teamCodes.all().map(r => r.team_id),
    putTeamCode: (teamId, hash) => q.putTeamCode.run(teamId, hash),
    deleteTeamCode: teamId => q.deleteTeamCode.run(teamId),
    clearTeamCodes: () => q.clearTeamCodes.run(),
    insertSession: (hash, s, expires) => q.insertSession.run(hash, s.main ? 1 : 0, JSON.stringify(s.teams), expires),
    session: hash => parseSession(q.session.get(hash)),
    updateSession: (hash, s) => q.updateSession.run(s.main ? 1 : 0, JSON.stringify(s.teams), hash),
    deleteSession: hash => q.deleteSession.run(hash),
    purgeSessions: () => q.purgeSessions.run(Date.now()),
    docs(col) {
      const out = {};
      for (const row of q.docsByCol.all(col)) out[row.id] = JSON.parse(row.data);
      return out;
    },
    doc(col, id) {
      const row = q.doc.get(col, id);
      return row ? JSON.parse(row.data) : null;
    },
    putDoc: (col, id, data) => q.putDoc.run(col, id, JSON.stringify(data), Date.now()),
    deleteDoc: (col, id) => q.deleteDoc.run(col, id),
    deleteCol: col => q.deleteCol.run(col),
    isEmpty: () => q.countDocs.get().n === 0,
    transaction(fn) {
      db.exec('BEGIN');
      try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    close: () => db.close(),
  };
}

module.exports = { openDatabase };
