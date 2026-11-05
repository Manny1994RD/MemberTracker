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
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'leader')),
      team_id TEXT,
      pass TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    countUsers: db.prepare('SELECT COUNT(*) AS n FROM users'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
    listUsers: db.prepare('SELECT id, username, name, role, team_id, created_at FROM users ORDER BY role, name'),
    insertUser: db.prepare('INSERT INTO users (id, username, name, role, team_id, pass, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
    clearTeam: db.prepare('UPDATE users SET team_id = NULL WHERE team_id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)'),
    session: db.prepare('SELECT * FROM sessions WHERE token_hash = ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires < ?'),
    docsByCol: db.prepare('SELECT id, data FROM docs WHERE col = ?'),
    doc: db.prepare('SELECT data FROM docs WHERE col = ? AND id = ?'),
    putDoc: db.prepare('INSERT INTO docs (col, id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'),
    deleteDoc: db.prepare('DELETE FROM docs WHERE col = ? AND id = ?'),
    deleteCol: db.prepare('DELETE FROM docs WHERE col = ?'),
  };

  const api = {
    raw: db,
    countUsers: () => q.countUsers.get().n,
    userById: id => q.userById.get(id),
    userByName: name => q.userByName.get(name),
    listUsers: () => q.listUsers.all(),
    insertUser: u => q.insertUser.run(u.id, u.username, u.name, u.role, u.team_id ?? null, u.pass, Date.now()),
    updateUser(id, fields) {
      const allowed = ['username', 'name', 'role', 'team_id', 'pass'];
      const keys = Object.keys(fields).filter(k => allowed.includes(k));
      if (!keys.length) return;
      db.prepare(`UPDATE users SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map(k => fields[k] ?? null), id);
    },
    deleteUser: id => q.deleteUser.run(id),
    clearTeamFromUsers: teamId => q.clearTeam.run(teamId),
    insertSession: (hash, userId, expires) => q.insertSession.run(hash, userId, expires),
    session: hash => q.session.get(hash),
    deleteSession: hash => q.deleteSession.run(hash),
    deleteUserSessions: userId => q.deleteUserSessions.run(userId),
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
    transaction(fn) {
      db.exec('BEGIN');
      try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    close: () => db.close(),
  };
  return api;
}

module.exports = { openDatabase };
