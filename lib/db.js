'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Lokasi database. Urutan: DATA_DIR (env) -> /data (volume permanen Deplexo) -> ./data (folder proyek).
// /tmp hanya cadangan terakhir: isinya HILANG saat redeploy/restart, jadi dianggap tidak permanen.
function writable(d) {
  try { fs.mkdirSync(d, { recursive: true }); fs.accessSync(d, fs.constants.W_OK); return true; } catch { return false; }
}
const candidates = [process.env.DATA_DIR, '/data', path.join(__dirname, '..', 'data'), path.join('/tmp', 'data')].filter(Boolean);
const dir = candidates.find(writable);
if (!dir) { console.error('Tidak ada folder yang bisa ditulis untuk database.'); process.exit(1); }
const persistent = !dir.startsWith('/tmp');
if (!persistent) console.error('PERINGATAN: database di ' + dir + ' bersifat SEMENTARA dan hilang saat redeploy. Pasang volume permanen dan set DATA_DIR=/data.');

const dbPath = path.join(dir, 'peduli.db');
const db = new Database(dbPath);

// Mode DELETE (bukan WAL) agar aman di volume/container: satu file database saja, tanpa file -wal/-shm
db.pragma('journal_mode = DELETE');
db.pragma('synchronous = FULL');
db.pragma('foreign_keys = ON');
db.storage = { dir, dbPath, persistent };

// Skema tabel database
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