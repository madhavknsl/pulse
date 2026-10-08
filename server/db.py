"""SQLite storage. Everything lives in one local file under data/ (never committed)."""
import os
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("PULSE_DATA", ROOT / "data"))
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "pulse.db"
SCHEMA_VERSION = 1

SCHEMA = """
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE COLLATE NOCASE,
  phone TEXT UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  phone_verified INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  preferred_name TEXT,
  dob TEXT NOT NULL,
  sex TEXT,
  city TEXT NOT NULL DEFAULT 'Bengaluru',
  language TEXT NOT NULL DEFAULT 'English',
  height_cm REAL,
  photo_file_id INTEGER,
  created_at TEXT NOT NULL,
  onboarding_step INTEGER NOT NULL DEFAULT 2,
  onboarded_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE consents (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  granted INTEGER NOT NULL,
  version TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (user_id, kind)
);

-- Small per-user documents: health_background, goals, notifications, device, plan, ui, emergency
CREATE TABLE user_settings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  kind TEXT NOT NULL,            -- weight (kg) | waist (cm)
  value REAL NOT NULL,
  UNIQUE (user_id, date, kind)
);

CREATE TABLE daily (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  steps INTEGER, rhr INTEGER, hrv INTEGER,
  spo2_avg REAL, spo2_min REAL,
  sleep_min INTEGER, bed_min INTEGER,
  mood INTEGER, mood_note TEXT, mood_at TEXT,
  stress INTEGER,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE period_days (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  flow TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE symptom_logs (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  symptoms TEXT NOT NULL,
  tags TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  meal_type TEXT NOT NULL,
  source TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT ''
);

CREATE TABLE medications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dose TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE med_log (
  med_id INTEGER NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL,          -- taken | missed
  PRIMARY KEY (med_id, date)
);

CREATE TABLE workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  minutes INTEGER NOT NULL
);

CREATE TABLE questionnaires (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,            -- phq9 | gad7
  date TEXT NOT NULL,
  answers TEXT NOT NULL,
  score INTEGER NOT NULL,
  is_baseline INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  date TEXT NOT NULL,
  minute INTEGER NOT NULL,
  mode TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming',   -- upcoming | done | cancelled
  created_at TEXT NOT NULL
);

CREATE TABLE links (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  share TEXT NOT NULL,
  expires TEXT NOT NULL,
  since TEXT NOT NULL,
  PRIMARY KEY (user_id, provider_id)
);

CREATE TABLE access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_key TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  ordered_on TEXT NOT NULL,
  due_on TEXT,
  status TEXT NOT NULL,          -- ordered | uploaded | reviewed
  status_on TEXT
);

CREATE TABLE results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_key TEXT NOT NULL,
  date TEXT NOT NULL,
  vals TEXT NOT NULL,
  ranges TEXT NOT NULL,
  file_id INTEGER
);

CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,            -- photo | report
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  path TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE summary_shares (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (user_id, provider_id)
);

CREATE TABLE diet_log (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  idx INTEGER NOT NULL,
  PRIMARY KEY (user_id, date, idx)
);

CREATE TABLE invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE,
  city TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (email, city)
);

CREATE INDEX idx_daily_user ON daily (user_id, date);
CREATE INDEX idx_meals_user ON meals (user_id, date);
CREATE INDEX idx_workouts_user ON workouts (user_id, date);
CREATE INDEX idx_appts_provider ON appointments (provider_id, date, minute);
CREATE INDEX idx_q_user ON questionnaires (user_id, kind, date);
"""


def connect():
    """One connection per request. Autocommit; the request wrapper opens transactions explicitly."""
    conn = sqlite3.connect(DB_PATH, timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


def init():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(DATA_DIR, 0o700)  # health data: owner only
    except OSError:
        pass
    conn = connect()
    try:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        if version == 0:
            conn.executescript(SCHEMA)
            conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
        elif version != SCHEMA_VERSION:
            raise SystemExit(f"Database schema version {version} is not supported by this build.")
    finally:
        conn.close()


def one(conn, sql, params=()):
    return conn.execute(sql, params).fetchone()


def all_(conn, sql, params=()):
    return conn.execute(sql, params).fetchall()


def run(conn, sql, params=()):
    return conn.execute(sql, params)
