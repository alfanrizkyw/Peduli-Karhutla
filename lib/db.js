'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.join(dir, 'peduli.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS donations (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  hide_name INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL,
  pay_amount INTEGER NOT NULL,
  qris TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  paid_at INTEGER,
  paid_via TEXT,
  email_sent INTEGER NOT NULL DEFAULT 0,
  email_attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_don_match ON donations(status, pay_amount, created_at);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  donation_id TEXT NOT NULL UNIQUE REFERENCES donations(id),
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS likes (
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  visitor TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (note_id, visitor)
);
CREATE TABLE IF NOT EXISTS disbursements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  category TEXT NOT NULL,
  location TEXT NOT NULL,
  recipient TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  proof_url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
`);

module.exports = db;
