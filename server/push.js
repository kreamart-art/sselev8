import webpush from 'web-push'
import { db, now, getSetting, setSetting } from './db.js'

// Keys from the environment win. Otherwise they are made once and kept in the database on
// the /data volume, so subscriptions survive redeploys. generateVAPIDKeys returns the raw
// base64url form browsers expect as applicationServerKey, not PEM or DER.
function vapidKeys() {
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey } = process.env
  if (publicKey && privateKey) return { publicKey, privateKey }
  const stored = getSetting('vapid', {})
  if (stored.publicKey && stored.privateKey) return stored
  const keys = webpush.generateVAPIDKeys()
  setSetting('vapid', keys)
  return keys
}

const keys = vapidKeys()
webpush.setVapidDetails('mailto:info@elev8entertainment.nl', keys.publicKey, keys.privateKey)
export const PUBLIC_KEY = keys.publicKey

export function saveSubscription(userId, { endpoint, p256dh, auth }) {
  db.prepare(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
  ).run(endpoint, userId, p256dh, auth, now())
}

export function removeSubscription(endpoint, userId) {
  if (userId) db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, userId)
  else db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint)
}

// Never throws: a failed notification must not break the request that triggered it.
export async function notify({ title, body = '', url = '/dashboard/', tag }, { userId } = {}) {
  try {
    const subs = userId
      ? db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId)
      : db.prepare('SELECT * FROM push_subscriptions').all()
    const payload = JSON.stringify({ title, body, url, tag })
    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 24 * 3600, urgency: 'high' }),
      ),
    )
    let sent = 0
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        sent += 1
        db.prepare('UPDATE push_subscriptions SET last_ok_at = ? WHERE endpoint = ?').run(now(), subs[i].endpoint)
      } else if ([404, 410].includes(r.reason?.statusCode)) {
        // The browser dropped this subscription (app removed, permission revoked).
        removeSubscription(subs[i].endpoint)
      } else {
        console.error(`[push] ${r.reason?.statusCode || ''} ${r.reason?.body || r.reason?.message || r.reason}`)
      }
    })
    return sent
  } catch (e) {
    console.error('[push]', e)
    return 0
  }
}
