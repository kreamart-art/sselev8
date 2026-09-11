import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
export const DATA_DIR = process.env.ELEV8_DATA_DIR || path.join(ROOT, 'data')
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
export const BACKUP_DIR = path.join(DATA_DIR, 'backups')
mkdirSync(UPLOAD_DIR, { recursive: true })
export const DB_PATH = path.join(DATA_DIR, 'elev8.db')

export const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')

export const now = () => Date.now()

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS link_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  title_nl TEXT NOT NULL DEFAULT '',
  title_en TEXT NOT NULL DEFAULT '',
  excerpt_nl TEXT NOT NULL DEFAULT '',
  excerpt_en TEXT NOT NULL DEFAULT '',
  body_nl TEXT NOT NULL DEFAULT '',
  body_en TEXT NOT NULL DEFAULT '',
  cover TEXT,
  published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  views INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline_nl TEXT NOT NULL DEFAULT '',
  tagline_en TEXT NOT NULL DEFAULT '',
  bio_nl TEXT NOT NULL DEFAULT '',
  bio_en TEXT NOT NULL DEFAULT '',
  photo TEXT,
  since TEXT NOT NULL DEFAULT '',
  links TEXT NOT NULL DEFAULT '{}',
  featured INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'nl',
  created_at INTEGER NOT NULL,
  handled_at INTEGER
);
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  lang TEXT NOT NULL DEFAULT 'nl',
  created_at INTEGER NOT NULL,
  unsub_token TEXT NOT NULL,
  unsubscribed_at INTEGER
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Aggregate counts only: no IP, no user agent, nothing that identifies a visitor.
CREATE TABLE IF NOT EXISTS pageviews (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);
CREATE INDEX IF NOT EXISTS posts_status_pub ON posts(status, published_at);
CREATE INDEX IF NOT EXISTS messages_created ON messages(created_at);
`)

export function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  if (!row) return fallback
  try {
    return { ...fallback, ...JSON.parse(row.value) }
  } catch {
    return fallback
  }
}

export function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    JSON.stringify(value),
  )
}

export const DEFAULT_ANNOUNCEMENT = { enabled: false, text_nl: '', text_en: '', link: '' }
export const DEFAULT_SOCIALS = { instagram: '', spotify: '', youtube: '', tiktok: '', linkedin: '' }

function seed() {
  const t = now()
  if (!db.prepare('SELECT 1 FROM artists LIMIT 1').get()) {
    db.prepare(
      `INSERT INTO artists (slug, name, tagline_nl, tagline_en, bio_nl, bio_en, photo, since, links, featured, visible, sort, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', 1, 1, 0, ?, ?)`,
    ).run(
      'kream',
      'KREAM',
      'Soul-electronic, geworteld in Amsterdam.',
      'Soul-electronic, anchored in Amsterdam.',
      'Een stem die geen aandacht vraagt, maar het verdient. KREAM beweegt tussen R&B, soul en elektronische texturen met een kalme autoriteit die je herinnert aan wat ingehoudenheid klinkt.',
      "A voice that doesn't ask for attention, it earns it. KREAM moves between R&B, soul, and electronic textures with a calm authority that reminds you what restraint sounds like.",
      '/img/kream.webp',
      '2026',
      t,
      t,
    )
  }
  if (!db.prepare("SELECT 1 FROM settings WHERE key = 'announcement'").get()) setSetting('announcement', DEFAULT_ANNOUNCEMENT)
  if (!db.prepare("SELECT 1 FROM settings WHERE key = 'socials'").get()) setSetting('socials', DEFAULT_SOCIALS)
}
seed()
