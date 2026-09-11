import crypto from 'node:crypto'
import { db, now } from './db.js'

const DAY = 24 * 60 * 60 * 1000
export const SESSION_TTL = 30 * DAY
export const SESSION_COOKIE = 'elev8_sid'

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex')

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(pw, stored) {
  if (!pw || !stored) return false
  const [salt, hash] = String(stored).split(':')
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const actual = crypto.scryptSync(String(pw), salt, expected.length)
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

export function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Kies een wachtwoord van minstens 10 tekens.'
  if (pw.length > 200) return 'Dat wachtwoord is te lang.'
  return null
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url')
  const t = now()
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    sha256(token),
    userId,
    t,
    t + SESSION_TTL,
  )
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(t, userId)
  return token
}

export function sessionUser(token) {
  if (!token) return null
  const t = now()
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, s.expires_at FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(sha256(token), t)
  if (!row) return null
  // Sliding expiry, but write at most once a day.
  if (row.expires_at - t < SESSION_TTL - DAY) {
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(t + SESSION_TTL, sha256(token))
  }
  return { id: row.id, email: row.email, name: row.name }
}

export function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token))
}

export function destroyOtherSessions(userId, keepToken) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, sha256(keepToken || ''))
}

// One-time links for first-time setup and password resets. Only the hash is stored.
export function createLinkToken(userId, kind, ttl = 7 * DAY) {
  db.prepare('DELETE FROM link_tokens WHERE user_id = ? AND kind = ? AND used_at IS NULL').run(userId, kind)
  const token = crypto.randomBytes(32).toString('base64url')
  const t = now()
  db.prepare('INSERT INTO link_tokens (token_hash, user_id, kind, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').run(
    sha256(token),
    userId,
    kind,
    t,
    t + ttl,
  )
  return token
}

export function peekLinkToken(token) {
  if (!token || typeof token !== 'string') return null
  return (
    db
      .prepare(
        `SELECT lt.kind, u.id, u.email, u.name FROM link_tokens lt
         JOIN users u ON u.id = lt.user_id
         WHERE lt.token_hash = ? AND lt.used_at IS NULL AND lt.expires_at > ?`,
      )
      .get(sha256(token), now()) || null
  )
}

export function consumeLinkToken(token) {
  const row = peekLinkToken(token)
  if (!row) return null
  db.prepare('UPDATE link_tokens SET used_at = ? WHERE token_hash = ?').run(now(), sha256(token))
  return row
}

// Creates the account if needed and returns a one-time setup link token.
export function inviteUser(email, name) {
  const clean = String(email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error('Ongeldig e-mailadres')
  let user = db.prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?').get(clean)
  if (!user) {
    const r = db.prepare('INSERT INTO users (email, name, created_at) VALUES (?, ?, ?)').run(clean, String(name || clean).trim(), now())
    user = { id: Number(r.lastInsertRowid), email: clean, name, password_hash: null }
  }
  const kind = user.password_hash ? 'reset' : 'setup'
  return { user, kind, token: createLinkToken(user.id, kind, kind === 'setup' ? 7 * DAY : 2 * DAY) }
}

const buckets = new Map()
export function rateLimit(key, max, windowMs) {
  const t = now()
  const b = buckets.get(key)
  if (!b || b.reset < t) {
    buckets.set(key, { n: 1, reset: t + windowMs })
    return true
  }
  b.n += 1
  return b.n <= max
}
setInterval(() => {
  const t = now()
  for (const [k, b] of buckets) if (b.reset < t) buckets.delete(k)
}, 10 * 60 * 1000).unref()

export function parseCookies(header) {
  const out = {}
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=')
    if (i < 1) continue
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
    } catch {
      /* ignore malformed cookie */
    }
  }
  return out
}

export function sessionCookie(token, secure) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL / 1000}${secure ? '; Secure' : ''}`
}

export function clearSessionCookie(secure) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`
}
