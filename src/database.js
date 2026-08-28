const { DatabaseSync } = require('node:sqlite'); // Node.js 22+ 내장 모듈 (별도 네이티브 빌드 불필요)
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, '..', 'data.sqlite'));
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  tax_channel_id TEXT,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  presence_channel_id TEXT,
  presence_message_id TEXT
);

CREATE TABLE IF NOT EXISTS citizens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  mc_nick TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'citizen', -- 'king' | 'citizen'
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS presence (
  guild_id TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'king' | 'citizen'
  joined_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (guild_id, discord_id)
);

CREATE TABLE IF NOT EXISTS tax_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  mc_nick TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  message_id TEXT,
  period TEXT NOT NULL, -- 'YYYY-MM'
  created_at TEXT DEFAULT (datetime('now')),
  reviewed_by TEXT,
  reviewed_at TEXT
);
`);

function getGuildSettings(guildId) {
  let row = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
  if (!row) {
    db.prepare('INSERT INTO guild_settings (guild_id) VALUES (?)').run(guildId);
    row = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
  }
  return row;
}

module.exports = { db, getGuildSettings };
