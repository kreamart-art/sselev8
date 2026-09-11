import express from 'express'
import crypto from 'node:crypto'
import path from 'node:path'
import multer from 'multer'
import { db, now, getSetting, setSetting, DEFAULT_ANNOUNCEMENT, DEFAULT_SOCIALS, UPLOAD_DIR } from './db.js'
import * as auth from './auth.js'
import { markdown, excerpt, slugify, esc } from './content.js'
import { saveImage, deleteImage } from './images.js'
import { gaConfigured, gaSummary } from './ga.js'
import { scheduleBackups } from './backup.js'
import * as push from './push.js'
import * as r from './render.js'

const PORT = Number(process.env.PORT) || 5460
const PROD = process.env.NODE_ENV === 'production'
const STAGING = process.env.ELEV8_STAGING === '1'
const GA_ID = /^G-[A-Z0-9]{4,}$/.test(process.env.GA_MEASUREMENT_ID || '') ? process.env.GA_MEASUREMENT_ID : ''
const DAY = 86_400_000
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/
const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|monitor|lighthouse|headless|curl|wget|python|go-http|java\//i

const fail = (status, message) => Object.assign(new Error(message), { status })
const str = (v, max) => String(v ?? '').trim().slice(0, max)
const dayStr = (ts = now()) => new Date(ts).toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' })

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
// Without this Express 5 treats /blog and /blog/ as one route and the slash redirects loop.
app.set('strict routing', true)

app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64')
  const g = GA_ID ? ' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com' : ''
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      `script-src 'self' 'nonce-${res.locals.nonce}'${GA_ID ? ' https://www.googletagmanager.com' : ''}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      `img-src 'self' data:${g}`,
      `connect-src 'self'${g}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  })
  if (PROD) res.set('Strict-Transport-Security', 'max-age=31536000')
  if (STAGING || req.path.startsWith('/dashboard') || req.path.startsWith('/api')) res.set('X-Robots-Tag', 'noindex, nofollow')
  next()
})

// ---------- static ----------
app.use(
  express.static(r.PUBLIC, {
    index: false,
    redirect: false,
    setHeaders(res, file) {
      if (/\.(css|js)$/.test(file)) res.set('Cache-Control', 'public, max-age=31536000, immutable')
      else if (file.endsWith('.webmanifest')) res.type('application/manifest+json').set('Cache-Control', 'public, max-age=86400')
      else res.set('Cache-Control', 'public, max-age=2592000')
    },
  }),
)
app.use('/uploads', express.static(UPLOAD_DIR, { index: false, redirect: false, maxAge: '30d', immutable: true }))
app.get('/dashboard', (req, res) => res.redirect(301, '/dashboard/'))
app.get('/dashboard/', (req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(r.DASHBOARD, 'index.html')))
app.use('/dashboard', express.static(r.DASHBOARD, { index: false, redirect: false, setHeaders: (res) => res.set('Cache-Control', 'no-cache') }))

// ---------- helpers ----------
const currentUser = (req) => auth.sessionUser(auth.parseCookies(req.get('cookie'))[auth.SESSION_COOKIE])
const isBot = (req) => BOT_RE.test(req.get('user-agent') || '')

function sameOrigin(req) {
  try {
    return new URL(req.get('origin') || '').host === req.get('host')
  } catch {
    return false
  }
}

function countView(req, key) {
  if (isBot(req) || currentUser(req)) return
  db.prepare('INSERT INTO pageviews (day, path, views) VALUES (?, ?, 1) ON CONFLICT(day, path) DO UPDATE SET views = views + 1').run(dayStr(), key)
}

const siteSettings = () => ({ announcement: getSetting('announcement', DEFAULT_ANNOUNCEMENT), socials: getSetting('socials', DEFAULT_SOCIALS) })

function send(res, { meta, main, status = 200, jsonLd }) {
  const html = r.layout({ meta, main, nonce: res.locals.nonce, settings: siteSettings(), gaId: GA_ID, noindex: STAGING, jsonLd })
  res.status(status).set('Cache-Control', 'no-cache').type('html').send(html)
}

function renderPage(res, name, { replace = {}, status, jsonLd } = {}) {
  const pg = r.loadPage(name)
  let main = pg.html
  for (const [k, v] of Object.entries(replace)) main = main.replace(`<!--@${k}-->`, () => v)
  send(res, { meta: pg.meta, main, status, jsonLd })
}

const publishedPosts = (limit = 100) =>
  db.prepare("SELECT * FROM posts WHERE status = 'published' AND published_at <= ? ORDER BY published_at DESC LIMIT ?").all(now(), limit)
const visibleArtists = () => db.prepare('SELECT * FROM artists WHERE visible = 1 ORDER BY sort, id').all()
const featuredArtist = () => db.prepare('SELECT * FROM artists WHERE visible = 1 ORDER BY featured DESC, sort, id LIMIT 1').get()

function orgJsonLd() {
  const socials = Object.values(getSetting('socials', DEFAULT_SOCIALS)).filter((v) => /^https:\/\//.test(v))
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'S&S ELEV8 Entertainment',
    url: r.BASE_URL,
    logo: `${r.BASE_URL}/logo.png`,
    email: 'info@elev8entertainment.nl',
    ...(socials.length ? { sameAs: socials } : {}),
  }
}

app.get('/healthz', (req, res) => {
  db.prepare('SELECT 1').get()
  res.set('Cache-Control', 'no-store').type('text').send('ok')
})

// ---------- pages ----------
const REDIRECTS = {
  '/index.html': '/',
  '/about': '/about.html',
  '/over-ons': '/about.html',
  '/services': '/services.html',
  '/diensten': '/services.html',
  '/roster': '/roster.html',
  '/contact': '/contact.html',
  '/blog/': '/blog',
  '/nieuws': '/blog',
  '/privacy.html': '/privacy',
}
app.get(Object.keys(REDIRECTS), (req, res) => res.redirect(301, REDIRECTS[req.path]))

app.get('/', (req, res) => {
  countView(req, '/')
  renderPage(res, 'home', {
    replace: { featured: r.featuredSection(featuredArtist()), news: r.newsSection(publishedPosts(3)) },
    jsonLd: orgJsonLd(),
  })
})
app.get('/about.html', (req, res) => {
  countView(req, '/about.html')
  renderPage(res, 'about')
})
app.get('/services.html', (req, res) => {
  countView(req, '/services.html')
  renderPage(res, 'services')
})
app.get('/roster.html', (req, res) => {
  countView(req, '/roster.html')
  renderPage(res, 'roster', { replace: { roster: r.rosterSection(visibleArtists()) } })
})
app.get('/contact.html', (req, res) => {
  countView(req, '/contact.html')
  renderPage(res, 'contact', { replace: { socials: r.socialLinks(getSetting('socials', DEFAULT_SOCIALS)) } })
})
app.get('/privacy', (req, res) => renderPage(res, 'privacy'))
app.get('/blog', (req, res) => {
  countView(req, '/blog')
  renderPage(res, 'blog', { replace: { posts: r.postsGrid(publishedPosts()) } })
})

app.get('/blog/:slug', (req, res, next) => {
  const p = db.prepare('SELECT * FROM posts WHERE slug = ?').get(String(req.params.slug))
  const user = currentUser(req)
  const live = p && p.status === 'published' && p.published_at <= now()
  if (!p || (!live && !user)) return next()
  if (live && !user && !isBot(req)) {
    db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(p.id)
    countView(req, `/blog/${p.slug}`)
  }
  const more = publishedPosts(3).filter((x) => x.id !== p.id).slice(0, 2)
  const desc = p.excerpt_nl || excerpt(p.body_nl, 160)
  send(res, {
    meta: {
      title: `${p.title_nl || 'Nieuws'} | S&S Elev8 Entertainment`,
      description: desc,
      ogTitle: p.title_nl,
      ogDescription: desc,
      ogType: 'article',
      ogImage: p.cover ? `${r.BASE_URL}${p.cover.replace(/\.webp$/, '-og.jpg')}` : undefined,
      path: `/blog/${p.slug}`,
      nav: 'news',
    },
    main: r.postPage(p, { draft: !live, more }),
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: p.title_nl,
      datePublished: new Date(p.published_at || p.created_at).toISOString(),
      dateModified: new Date(p.updated_at).toISOString(),
      ...(p.cover ? { image: `${r.BASE_URL}${p.cover}` } : {}),
      publisher: { '@type': 'Organization', name: 'S&S ELEV8 Entertainment', logo: { '@type': 'ImageObject', url: `${r.BASE_URL}/logo.png` } },
      mainEntityOfPage: `${r.BASE_URL}/blog/${p.slug}`,
    },
  })
})

app.get('/unsubscribe', (req, res) => {
  const token = str(req.query.token, 100)
  const row = token && db.prepare('SELECT id FROM subscribers WHERE unsub_token = ?').get(token)
  if (row) db.prepare('UPDATE subscribers SET unsubscribed_at = COALESCE(unsubscribed_at, ?) WHERE id = ?').run(now(), row.id)
  send(res, {
    meta: { title: 'Nieuwsbrief | S&S Elev8 Entertainment', path: '/unsubscribe', nav: 'other' },
    main: row
      ? r.simplePage('Nieuwsbrief', 'Je bent', 'You have been', 'afgemeld.', 'unsubscribed.', `<p class="lead">${r.bi('Je ontvangt geen updates meer van ons. Toch weer aanmelden kan altijd onderaan de pagina.', 'You will no longer receive updates from us. You can sign up again at the bottom of the page any time.')}</p>`)
      : r.simplePage('Nieuwsbrief', 'Deze link', 'This link', 'klopt niet.', 'is not valid.', `<p class="lead">${r.bi('Misschien is hij al gebruikt. Mail ons gerust als je hulp nodig hebt.', 'It may have been used already. Feel free to email us if you need help.')}</p>`),
  })
})

// ---------- feeds ----------
app.get('/feed.xml', (req, res) => {
  const items = publishedPosts(20)
    .map(
      (p) => `<item><title>${esc(p.title_nl)}</title><link>${r.BASE_URL}/blog/${esc(p.slug)}</link><guid>${r.BASE_URL}/blog/${esc(p.slug)}</guid><pubDate>${new Date(p.published_at).toUTCString()}</pubDate><description>${esc(p.excerpt_nl || excerpt(p.body_nl, 300))}</description></item>`,
    )
    .join('')
  res
    .type('application/rss+xml')
    .set('Cache-Control', 'public, max-age=900')
    .send(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>S&amp;S ELEV8 Entertainment</title><link>${r.BASE_URL}/blog</link><description>Nieuws van S&amp;S ELEV8 Entertainment</description><language>nl</language>${items}</channel></rss>`)
})

app.get('/sitemap.xml', (req, res) => {
  const pages = ['/', '/about.html', '/services.html', '/roster.html', '/contact.html', '/blog', '/privacy'].map((p) => `<url><loc>${r.BASE_URL}${p}</loc></url>`)
  const posts = publishedPosts(1000).map((p) => `<url><loc>${r.BASE_URL}/blog/${esc(p.slug)}</loc><lastmod>${new Date(p.updated_at).toISOString().slice(0, 10)}</lastmod></url>`)
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...pages, ...posts].join('')}</urlset>`)
})

app.get('/robots.txt', (req, res) => {
  res
    .type('text/plain')
    .send(STAGING ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nDisallow: /dashboard/\nDisallow: /api/\n\nSitemap: ${r.BASE_URL}/sitemap.xml\n`)
})

// ---------- public forms ----------
const publicJson = express.json({ limit: '20kb' })

app.post('/api/contact', publicJson, (req, res) => {
  if (!sameOrigin(req)) throw fail(403, 'forbidden')
  const b = req.body || {}
  if (b.website) return res.json({ ok: true })
  if (!auth.rateLimit(`contact:${req.ip}`, 5, 10 * 60_000)) throw fail(429, 'rate')
  const name = str(b.name, 120)
  const email = str(b.email, 200).toLowerCase()
  const message = str(b.message, 5000)
  if (!name || !EMAIL_RE.test(email) || message.length < 2) throw fail(400, 'invalid')
  const topic = str(b.topic, 80)
  const { lastInsertRowid } = db.prepare('INSERT INTO messages (name, email, topic, body, lang, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    name,
    email,
    topic,
    message,
    b.lang === 'en' ? 'en' : 'nl',
    now(),
  )
  push.notify({
    title: `Nieuw bericht van ${name}`,
    body: `${topic ? `${topic}: ` : ''}${message.replace(/\s+/g, ' ').slice(0, 160)}`,
    url: '/dashboard/#/berichten',
    tag: `message-${lastInsertRowid}`,
  })
  res.json({ ok: true })
})

app.post('/api/subscribe', publicJson, (req, res) => {
  if (!sameOrigin(req)) throw fail(403, 'forbidden')
  const b = req.body || {}
  if (b.website) return res.json({ ok: true })
  if (!auth.rateLimit(`sub:${req.ip}`, 5, 10 * 60_000)) throw fail(429, 'rate')
  const email = str(b.email, 200).toLowerCase()
  if (!EMAIL_RE.test(email)) throw fail(400, 'invalid')
  const before = db.prepare('SELECT unsubscribed_at FROM subscribers WHERE email = ?').get(email)
  db.prepare(
    `INSERT INTO subscribers (email, lang, created_at, unsub_token) VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET unsubscribed_at = NULL, lang = excluded.lang`,
  ).run(email, b.lang === 'en' ? 'en' : 'nl', now(), crypto.randomBytes(18).toString('base64url'))
  if (!before || before.unsubscribed_at) {
    push.notify({ title: 'Nieuwe aanmelding voor de nieuwsbrief', body: email, url: '/dashboard/#/nieuwsbrief', tag: `subscriber-${email}` })
  }
  res.json({ ok: true })
})

// ---------- dashboard API ----------
const admin = express.Router()
admin.use(express.json({ limit: '2mb' }))
admin.use((req, res, next) => {
  if (req.method !== 'GET' && !sameOrigin(req)) throw fail(403, 'Verzoek van onbekende herkomst.')
  next()
})

const setCookie = (res, token) => res.set('Set-Cookie', auth.sessionCookie(token, PROD))

admin.post('/login', (req, res) => {
  const email = str(req.body?.email, 200).toLowerCase()
  if (!auth.rateLimit(`login-ip:${req.ip}`, 20, 15 * 60_000) || !auth.rateLimit(`login:${email}`, 6, 15 * 60_000)) {
    throw fail(429, 'Te veel pogingen. Probeer het over een kwartier opnieuw.')
  }
  const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email)
  if (!user || !auth.verifyPassword(String(req.body?.password || ''), user.password_hash)) throw fail(401, 'E-mailadres of wachtwoord klopt niet.')
  setCookie(res, auth.createSession(user.id))
  res.json({ ok: true })
})

admin.post('/logout', (req, res) => {
  auth.destroySession(auth.parseCookies(req.get('cookie'))[auth.SESSION_COOKIE])
  res.set('Set-Cookie', auth.clearSessionCookie(PROD)).json({ ok: true })
})

admin.get('/token', (req, res) => {
  const row = auth.peekLinkToken(str(req.query.token, 100))
  if (!row) throw fail(404, 'Deze link is verlopen of al gebruikt. Vraag een nieuwe aan.')
  res.json({ kind: row.kind, email: row.email, name: row.name })
})

admin.post('/token', (req, res) => {
  if (!auth.rateLimit(`token:${req.ip}`, 10, 15 * 60_000)) throw fail(429, 'Te veel pogingen.')
  const problem = auth.passwordProblem(req.body?.password)
  if (problem) throw fail(400, problem)
  const row = auth.consumeLinkToken(str(req.body?.token, 100))
  if (!row) throw fail(404, 'Deze link is verlopen of al gebruikt. Vraag een nieuwe aan.')
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(req.body.password), row.id)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.id)
  setCookie(res, auth.createSession(row.id))
  res.json({ ok: true })
})

admin.use((req, res, next) => {
  const user = currentUser(req)
  if (!user) throw fail(401, 'Niet ingelogd.')
  req.user = user
  next()
})

admin.get('/me', (req, res) =>
  res.json({ user: req.user, ga: { measurement: Boolean(GA_ID), reporting: gaConfigured() }, staging: STAGING, push: { key: push.PUBLIC_KEY } }),
)

// push notifications, one subscription per device
const B64URL = /^[\w-]{16,200}={0,2}$/
admin.post('/push/subscribe', (req, res) => {
  const s = req.body?.subscription || {}
  const endpoint = str(s.endpoint, 1000)
  if (!/^https:\/\/[^\s<>"]+$/.test(endpoint) || !B64URL.test(s.keys?.p256dh || '') || !B64URL.test(s.keys?.auth || '')) {
    throw fail(400, 'Deze aanmelding voor meldingen klopt niet.')
  }
  push.saveSubscription(req.user.id, { endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth })
  res.json({ ok: true })
})
admin.post('/push/unsubscribe', (req, res) => {
  push.removeSubscription(str(req.body?.endpoint, 1000), req.user.id)
  res.json({ ok: true })
})
admin.post('/push/test', async (req, res) => {
  const sent = await push.notify(
    { title: 'Meldingen staan aan', body: 'Zo ziet een melding van het ELEV8-dashboard eruit.', url: '/dashboard/#/account', tag: 'test' },
    { userId: req.user.id },
  )
  if (!sent) throw fail(400, 'De testmelding kon niet worden verstuurd. Zet de meldingen op dit apparaat uit en weer aan.')
  res.json({ sent })
})

admin.get('/overview', (req, res) => {
  const start = dayStr(now() - 29 * DAY)
  const rows = db.prepare('SELECT day, SUM(views) AS views FROM pageviews WHERE day >= ? GROUP BY day').all(start)
  const byDay = Object.fromEntries(rows.map((x) => [x.day, x.views]))
  const daily = Array.from({ length: 30 }, (_, i) => {
    const day = dayStr(now() - (29 - i) * DAY)
    return { day, value: byDay[day] || 0 }
  })
  const sum = (from) => db.prepare('SELECT COALESCE(SUM(views), 0) AS v FROM pageviews WHERE day >= ?').get(from).v
  const count = (sql, ...a) => db.prepare(sql).get(...a).n
  res.json({
    views7: sum(dayStr(now() - 6 * DAY)),
    views30: sum(start),
    daily,
    topPages: db.prepare('SELECT path AS label, SUM(views) AS value FROM pageviews WHERE day >= ? GROUP BY path ORDER BY value DESC LIMIT 8').all(start),
    topPosts: db.prepare("SELECT id, slug, title_nl, views FROM posts WHERE status = 'published' ORDER BY views DESC LIMIT 5").all(),
    counts: {
      published: count("SELECT COUNT(*) AS n FROM posts WHERE status = 'published'"),
      drafts: count("SELECT COUNT(*) AS n FROM posts WHERE status = 'draft'"),
      artists: count('SELECT COUNT(*) AS n FROM artists WHERE visible = 1'),
      unread: count('SELECT COUNT(*) AS n FROM messages WHERE handled_at IS NULL'),
      subscribers: count('SELECT COUNT(*) AS n FROM subscribers WHERE unsubscribed_at IS NULL'),
    },
    recentMessages: db.prepare('SELECT id, name, topic, created_at, handled_at FROM messages ORDER BY created_at DESC LIMIT 5').all(),
  })
})

admin.get('/ga', async (req, res) => {
  if (!gaConfigured()) return res.json({ configured: false })
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30
  try {
    res.json({ configured: true, days, ...(await gaSummary(days)) })
  } catch (e) {
    res.json({ configured: true, error: e.message })
  }
})

// posts
function uniqueSlug(table, base, id = 0) {
  const root = slugify(base)
  let slug = root
  for (let i = 2; db.prepare(`SELECT 1 FROM ${table} WHERE slug = ? AND id != ?`).get(slug, id); i++) slug = `${root}-${i}`
  return slug
}
const isUpload = (u) => typeof u === 'string' && /^\/uploads\/[\w-]+\.webp$/.test(u)

function postFromBody(b, existing) {
  const p = {
    title_nl: str(b.title_nl, 200),
    title_en: str(b.title_en, 200),
    excerpt_nl: str(b.excerpt_nl, 400),
    excerpt_en: str(b.excerpt_en, 400),
    body_nl: str(b.body_nl, 100_000),
    body_en: str(b.body_en, 100_000),
    cover: isUpload(b.cover) ? b.cover : null,
    status: b.status === 'published' ? 'published' : 'draft',
    published_at: existing?.published_at || null,
  }
  if (b.published_at) {
    const t = Date.parse(b.published_at)
    if (!Number.isNaN(t)) p.published_at = t
  }
  if (p.status === 'published') {
    if (!p.title_nl) throw fail(400, 'Geef het bericht een titel voordat je publiceert.')
    if (!p.body_nl) throw fail(400, 'Schrijf eerst de tekst voordat je publiceert.')
    if (!p.published_at) p.published_at = now()
  }
  return p
}

admin.get('/posts', (req, res) => {
  res.json(db.prepare('SELECT id, slug, status, title_nl, title_en, cover, published_at, updated_at, views FROM posts ORDER BY COALESCE(published_at, updated_at) DESC').all())
})
admin.get('/posts/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(req.params.id))
  if (!p) throw fail(404, 'Bericht niet gevonden.')
  res.json(p)
})
admin.post('/posts', (req, res) => {
  const p = postFromBody(req.body || {})
  const t = now()
  const slug = uniqueSlug('posts', str(req.body?.slug, 80) || p.title_nl || `bericht-${t}`)
  const r2 = db
    .prepare(
      `INSERT INTO posts (slug, status, title_nl, title_en, excerpt_nl, excerpt_en, body_nl, body_en, cover, published_at, created_at, updated_at, author_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(slug, p.status, p.title_nl, p.title_en, p.excerpt_nl, p.excerpt_en, p.body_nl, p.body_en, p.cover, p.published_at, t, t, req.user.id)
  res.json({ id: Number(r2.lastInsertRowid), slug })
})
admin.put('/posts/:id', (req, res) => {
  const id = Number(req.params.id)
  const old = db.prepare('SELECT * FROM posts WHERE id = ?').get(id)
  if (!old) throw fail(404, 'Bericht niet gevonden.')
  const p = postFromBody(req.body || {}, old)
  const wanted = str(req.body?.slug, 80)
  const slug = wanted && slugify(wanted) !== old.slug ? uniqueSlug('posts', wanted, id) : old.slug
  db.prepare(
    `UPDATE posts SET slug = ?, status = ?, title_nl = ?, title_en = ?, excerpt_nl = ?, excerpt_en = ?, body_nl = ?, body_en = ?, cover = ?, published_at = ?, updated_at = ? WHERE id = ?`,
  ).run(slug, p.status, p.title_nl, p.title_en, p.excerpt_nl, p.excerpt_en, p.body_nl, p.body_en, p.cover, p.published_at, now(), id)
  if (old.cover && old.cover !== p.cover) deleteImage(old.cover)
  res.json({ id, slug })
})
admin.delete('/posts/:id', (req, res) => {
  const p = db.prepare('SELECT cover FROM posts WHERE id = ?').get(Number(req.params.id))
  if (!p) throw fail(404, 'Bericht niet gevonden.')
  db.prepare('DELETE FROM posts WHERE id = ?').run(Number(req.params.id))
  deleteImage(p.cover)
  res.json({ ok: true })
})
admin.post('/preview', (req, res) => res.json({ html: markdown(req.body?.markdown) }))

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1 } })
admin.post('/upload', upload.single('image'), async (req, res) => {
  if (!req.file) throw fail(400, 'Geen foto ontvangen.')
  try {
    res.json(await saveImage(req.file.buffer))
  } catch (e) {
    throw fail(400, e.message?.includes('niet ondersteund') ? e.message : 'Dit bestand kon niet als foto worden gelezen.')
  }
})

// artists
function artistFromBody(b) {
  const links = {}
  for (const k of ['instagram', 'spotify', 'youtube', 'tiktok', 'website']) {
    const v = str(b.links?.[k], 300)
    if (v) {
      if (!/^https:\/\/[^\s<>"]+$/.test(v)) throw fail(400, `De ${k}-link moet met https:// beginnen.`)
      links[k] = v
    }
  }
  const a = {
    name: str(b.name, 80),
    tagline_nl: str(b.tagline_nl, 200),
    tagline_en: str(b.tagline_en, 200),
    bio_nl: str(b.bio_nl, 3000),
    bio_en: str(b.bio_en, 3000),
    photo: isUpload(b.photo) || /^\/img\/[\w-]+\.webp$/.test(b.photo || '') ? b.photo : null,
    since: str(b.since, 20),
    links: JSON.stringify(links),
    featured: b.featured ? 1 : 0,
    visible: b.visible === false ? 0 : 1,
    sort: Number.isFinite(Number(b.sort)) ? Math.trunc(Number(b.sort)) : 0,
  }
  if (!a.name) throw fail(400, 'Een artiest heeft een naam nodig.')
  return a
}
admin.get('/artists', (req, res) => res.json(db.prepare('SELECT * FROM artists ORDER BY sort, id').all()))
admin.post('/artists', (req, res) => {
  const a = artistFromBody(req.body || {})
  const t = now()
  if (a.featured) db.prepare('UPDATE artists SET featured = 0').run()
  const r2 = db
    .prepare(
      `INSERT INTO artists (slug, name, tagline_nl, tagline_en, bio_nl, bio_en, photo, since, links, featured, visible, sort, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(uniqueSlug('artists', a.name), a.name, a.tagline_nl, a.tagline_en, a.bio_nl, a.bio_en, a.photo, a.since, a.links, a.featured, a.visible, a.sort, t, t)
  res.json({ id: Number(r2.lastInsertRowid) })
})
admin.put('/artists/:id', (req, res) => {
  const id = Number(req.params.id)
  const old = db.prepare('SELECT * FROM artists WHERE id = ?').get(id)
  if (!old) throw fail(404, 'Artiest niet gevonden.')
  const a = artistFromBody(req.body || {})
  if (a.featured) db.prepare('UPDATE artists SET featured = 0 WHERE id != ?').run(id)
  db.prepare(
    `UPDATE artists SET name = ?, tagline_nl = ?, tagline_en = ?, bio_nl = ?, bio_en = ?, photo = ?, since = ?, links = ?, featured = ?, visible = ?, sort = ?, updated_at = ? WHERE id = ?`,
  ).run(a.name, a.tagline_nl, a.tagline_en, a.bio_nl, a.bio_en, a.photo, a.since, a.links, a.featured, a.visible, a.sort, now(), id)
  if (old.photo && old.photo !== a.photo) deleteImage(old.photo)
  res.json({ id })
})
admin.delete('/artists/:id', (req, res) => {
  const a = db.prepare('SELECT photo FROM artists WHERE id = ?').get(Number(req.params.id))
  if (!a) throw fail(404, 'Artiest niet gevonden.')
  db.prepare('DELETE FROM artists WHERE id = ?').run(Number(req.params.id))
  deleteImage(a.photo)
  res.json({ ok: true })
})

// messages
admin.get('/messages', (req, res) => res.json(db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 500').all()))
admin.put('/messages/:id', (req, res) => {
  db.prepare('UPDATE messages SET handled_at = ? WHERE id = ?').run(req.body?.handled ? now() : null, Number(req.params.id))
  res.json({ ok: true })
})
admin.delete('/messages/:id', (req, res) => {
  db.prepare('DELETE FROM messages WHERE id = ?').run(Number(req.params.id))
  res.json({ ok: true })
})

// subscribers
admin.get('/subscribers', (req, res) => {
  res.json(db.prepare('SELECT id, email, lang, created_at, unsubscribed_at FROM subscribers ORDER BY created_at DESC').all())
})
admin.delete('/subscribers/:id', (req, res) => {
  db.prepare('DELETE FROM subscribers WHERE id = ?').run(Number(req.params.id))
  res.json({ ok: true })
})
admin.get('/subscribers.csv', (req, res) => {
  const cell = (v) => {
    const s = String(v ?? '')
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
    return `"${safe.replace(/"/g, '""')}"`
  }
  const rows = db.prepare('SELECT email, lang, created_at, unsub_token FROM subscribers WHERE unsubscribed_at IS NULL ORDER BY created_at').all()
  const csv = [
    ['email', 'taal', 'aangemeld_op', 'afmeldlink'].map(cell).join(','),
    ...rows.map((s) => [s.email, s.lang, new Date(s.created_at).toISOString().slice(0, 10), `${r.BASE_URL}/unsubscribe?token=${s.unsub_token}`].map(cell).join(',')),
  ].join('\n')
  res.set('Content-Disposition', `attachment; filename="nieuwsbrief-${dayStr()}.csv"`).type('text/csv').send(`﻿${csv}`)
})

// settings
admin.get('/settings', (req, res) => res.json(siteSettings()))
admin.put('/settings', (req, res) => {
  const b = req.body || {}
  if (b.announcement) {
    const link = str(b.announcement.link, 300)
    if (link && !/^(\/[^\s<>"]*|https:\/\/[^\s<>"]+)$/.test(link)) throw fail(400, 'De link moet met / of https:// beginnen.')
    setSetting('announcement', {
      enabled: Boolean(b.announcement.enabled),
      text_nl: str(b.announcement.text_nl, 160),
      text_en: str(b.announcement.text_en, 160),
      link,
    })
  }
  if (b.socials) {
    const socials = {}
    for (const k of Object.keys(DEFAULT_SOCIALS)) {
      const v = str(b.socials[k], 300)
      if (v && !/^https:\/\/[^\s<>"]+$/.test(v)) throw fail(400, `De ${k}-link moet met https:// beginnen.`)
      socials[k] = v
    }
    setSetting('socials', socials)
  }
  res.json(siteSettings())
})

// accounts
const linkFor = (token) => `${r.BASE_URL}/dashboard/?token=${token}`
admin.get('/users', (req, res) => {
  res.json(db.prepare('SELECT id, email, name, password_hash IS NOT NULL AS active, last_login_at, created_at FROM users ORDER BY id').all())
})
admin.post('/users', (req, res) => {
  const { user, kind, token } = auth.inviteUser(req.body?.email, str(req.body?.name, 80))
  res.json({ id: user.id, kind, link: linkFor(token) })
})
admin.post('/users/:id/reset', (req, res) => {
  const u = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(Number(req.params.id))
  if (!u) throw fail(404, 'Account niet gevonden.')
  const kind = u.password_hash ? 'reset' : 'setup'
  res.json({ kind, link: linkFor(auth.createLinkToken(u.id, kind, 2 * DAY)) })
})
admin.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id)
  if (id === req.user.id) throw fail(400, 'Je kunt je eigen account niet verwijderen.')
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
  res.json({ ok: true })
})
admin.put('/password', (req, res) => {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id)
  if (!auth.verifyPassword(String(req.body?.current || ''), row.password_hash)) throw fail(400, 'Je huidige wachtwoord klopt niet.')
  const problem = auth.passwordProblem(req.body?.next)
  if (problem) throw fail(400, problem)
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(req.body.next), req.user.id)
  auth.destroyOtherSessions(req.user.id, auth.parseCookies(req.get('cookie'))[auth.SESSION_COOKIE])
  res.json({ ok: true })
})

app.use('/api/admin', admin)

// ---------- fallbacks ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'Niet gevonden.' }))
app.use((req, res) => renderPage(res, '404', { status: 404 }))

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err)
  let status = err.status || 500
  let message = err.message
  if (err instanceof multer.MulterError) {
    status = 400
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Die foto is te groot (maximaal 12 MB).' : 'Uploaden is mislukt.'
  } else if (err.type === 'entity.too.large') {
    status = 413
    message = 'Dat is te veel tekst in één keer.'
  } else if (err.type === 'entity.parse.failed') {
    status = 400
    message = 'Ongeldig verzoek.'
  }
  if (status >= 500) console.error(err)
  if (req.path.startsWith('/api/')) return res.status(status).json({ error: status >= 500 ? 'Er ging iets mis. Probeer het opnieuw.' : message })
  res.status(status).type('text').send('Er ging iets mis.')
})

scheduleBackups()
app.listen(PORT, () => console.log(`[elev8] listening on :${PORT}${STAGING ? ' (staging)' : ''}${GA_ID ? ` GA ${GA_ID}` : ''}`))
