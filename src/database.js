// DB를 Render 서버 로컬 파일이 아니라, 밖에 있는 Turso(무료 클라우드 SQLite 호환 DB)에 저장합니다.
// 그래야 Render가 재배포되거나 재시작돼도 데이터가 그대로 유지돼요.
const { createClient } = require('@libsql/client');

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.error('❌ TURSO_DATABASE_URL / TURSO_AUTH_TOKEN 환경변수가 설정되지 않았습니다. .env 또는 Render 환경변수를 확인해주세요.');
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// 기존 코드가 db.prepare(sql).run(...) / .get(...) / .all(...) 형태를 그대로 쓰도록,
// libsql 클라이언트를 얇게 감싼 래퍼입니다. (기존과 다른 점은 전부 async라는 것뿐이에요 — 호출부에 await만 붙이면 됩니다.)
function prepare(sql) {
  return {
    async run(...args) {
      const rs = await client.execute({ sql, args });
      return {
        lastInsertRowid: rs.lastInsertRowid !== undefined ? Number(rs.lastInsertRowid) : undefined,
        changes: rs.rowsAffected,
      };
    },
    async get(...args) {
      const rs = await client.execute({ sql, args });
      return rs.rows[0] ?? undefined;
    },
    async all(...args) {
      const rs = await client.execute({ sql, args });
      return rs.rows;
    },
  };
}

async function exec(sql) {
  // 세미콜론으로 여러 문장이 이어진 스키마 생성 스크립트를 순서대로 실행합니다.
  const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
  for (const statement of statements) {
    await client.execute(statement);
  }
}

const db = { prepare, exec };

async function initDb() {
  await exec(`
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  tax_channel_id TEXT,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  presence_channel_id TEXT,
  presence_message_id TEXT,
  tax_info_message_id TEXT
);

CREATE TABLE IF NOT EXISTS citizens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  mc_nick TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'citizen',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS presence (
  guild_id TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  role TEXT NOT NULL,
  joined_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (guild_id, discord_id)
);

CREATE TABLE IF NOT EXISTS tax_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  mc_nick TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  message_id TEXT,
  period TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  reject_reason TEXT
);
`);

  // 기존에 만들어진 DB에 새 컬럼이 없을 수 있으므로 안전하게 마이그레이션합니다.
  await ensureColumn('guild_settings', 'tax_info_message_id', 'TEXT');
  await ensureColumn('tax_payments', 'reject_reason', 'TEXT');
}

async function ensureColumn(table, column, definition) {
  const rs = await client.execute(`PRAGMA table_info(${table})`);
  const exists = rs.rows.some((c) => c.name === column);
  if (!exists) {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function getGuildSettings(guildId) {
  let row = await db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
  if (!row) {
    await db.prepare('INSERT INTO guild_settings (guild_id) VALUES (?)').run(guildId);
    row = await db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
  }
  return row;
}

module.exports = { db, getGuildSettings, initDb };
