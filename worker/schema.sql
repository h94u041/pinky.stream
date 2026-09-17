-- Pinky D1 schema。座標一律世界座標（公尺，原點台中車站附近；見 src/world/geo.ts）。
-- 隱私（memo2 §7）：所有「誰」都只存承諾值 commit_hash，沒有任何個資。

CREATE TABLE IF NOT EXISTS merchants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  pass_hash   TEXT NOT NULL,
  salt        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  expires_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS torches (
  id          TEXT PRIMARY KEY,
  merchant_id TEXT,                 -- NULL = 自發聚集的暫時火把
  name        TEXT NOT NULL,
  x           REAL NOT NULL,
  y           REAL NOT NULL,
  base_r      REAL NOT NULL,
  lit         INTEGER NOT NULL DEFAULT 0,
  burn_hours  REAL,
  lit_at      INTEGER,
  temporary   INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS holdings (
  id          TEXT PRIMARY KEY,
  torch_id    TEXT NOT NULL,
  title       TEXT NOT NULL,
  start_at    INTEGER NOT NULL,
  capacity    INTEGER NOT NULL,
  entry       TEXT,
  tasks       TEXT NOT NULL,        -- JSON: [{id,label,reward}]
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS holding_joins (
  holding_id  TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  done_tasks  TEXT NOT NULL DEFAULT '[]',   -- JSON: [taskId]
  completed   INTEGER NOT NULL DEFAULT 0,
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (holding_id, commit_hash)
);

CREATE TABLE IF NOT EXISTS supplies (
  id          TEXT PRIMARY KEY,
  torch_id    TEXT NOT NULL,
  x           REAL NOT NULL,
  y           REAL NOT NULL,
  kind        TEXT NOT NULL,
  label       TEXT NOT NULL,
  rare        INTEGER NOT NULL DEFAULT 0,
  total       INTEGER NOT NULL,
  remaining   INTEGER NOT NULL,
  per_person  INTEGER NOT NULL DEFAULT 1,
  requirement TEXT NOT NULL DEFAULT 'none',  -- none | reservation
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pickups (
  supply_id   TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  last_at     INTEGER NOT NULL,
  PRIMARY KEY (supply_id, commit_hash)
);

CREATE TABLE IF NOT EXISTS gatherings (
  id            TEXT PRIMARY KEY,
  host_commit   TEXT NOT NULL,
  title         TEXT NOT NULL,
  place_name    TEXT NOT NULL,
  district      TEXT,
  x             REAL NOT NULL,
  y             REAL NOT NULL,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  start_at      INTEGER NOT NULL,
  deadline      INTEGER NOT NULL,
  built_in      INTEGER NOT NULL,
  cap           INTEGER,                    -- NULL = 不限
  need_more     INTEGER NOT NULL,
  passphrase    TEXT NOT NULL,
  host_pays     INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL,              -- pending | formed | dissolved | ended
  torch_id      TEXT,
  temp_torch_id TEXT,
  completed     INTEGER NOT NULL DEFAULT 0,
  dissolved_at  INTEGER,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS gathering_joins (
  gathering_id TEXT NOT NULL,
  commit_hash  TEXT NOT NULL,
  suffix       TEXT NOT NULL,               -- 密語附加號碼，如 A1C
  joined_at    INTEGER NOT NULL,
  PRIMARY KEY (gathering_id, commit_hash)
);

-- 探知：只有探知開著的人才有一列；關掉即刪；2 分鐘沒更新視同離開。
CREATE TABLE IF NOT EXISTS presence (
  commit_hash TEXT PRIMARY KEY,
  codename    TEXT NOT NULL,
  x           REAL NOT NULL,
  y           REAL NOT NULL,
  light_id    TEXT NOT NULL,
  since       INTEGER NOT NULL,
  badges      TEXT NOT NULL DEFAULT '[]',
  history     TEXT NOT NULL DEFAULT '[]',
  updated_at  INTEGER NOT NULL
);

-- 完成過的火把事件（給探知卡片的「曾完成的火把事件」與經驗值）
CREATE TABLE IF NOT EXISTS completions (
  commit_hash TEXT NOT NULL,
  event_title TEXT NOT NULL,
  xp          INTEGER NOT NULL,
  at          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gatherings_status ON gatherings(status);
CREATE INDEX IF NOT EXISTS idx_presence_light ON presence(light_id);
CREATE INDEX IF NOT EXISTS idx_completions_commit ON completions(commit_hash);
