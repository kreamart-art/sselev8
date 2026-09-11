import { readFileSync } from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { esc, formatDate, markdown } from './content.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
export const SITE = path.join(ROOT, 'site')
export const PUBLIC = path.join(SITE, 'public')
export const DASHBOARD = path.join(ROOT, 'dashboard')
const PAGES = path.join(SITE, 'pages')
export const BASE_URL = (process.env.PUBLIC_URL || 'https://elev8entertainment.nl').replace(/\/$/, '')
const DEV = process.env.NODE_ENV !== 'production'
const BRAND = 'S&S Elev8 Entertainment'

const hashOf = (file) => crypto.createHash('md5').update(readFileSync(path.join(PUBLIC, file))).digest('hex').slice(0, 10)
let assets = { css: hashOf('styles.css'), js: hashOf('script.js') }

const cache = new Map()
export function loadPage(name) {
  if (!DEV && cache.has(name)) return cache.get(name)
  if (DEV) assets = { css: hashOf('styles.css'), js: hashOf('script.js') }
  const raw = readFileSync(path.join(PAGES, `${name}.html`), 'utf8')
  const m = raw.match(/^<!--meta\s+([\s\S]*?)-->\s*/)
  const page = { meta: m ? JSON.parse(m[1]) : {}, html: m ? raw.slice(m[0].length) : raw }
  cache.set(name, page)
  return page
}

// Bilingual text. English falls back to Dutch when a founder leaves it empty.
export const bi = (nl, en) => `<span data-show="nl">${esc(nl)}</span><span data-show="en">${esc(en || nl)}</span>`
const biHtml = (nl, en) => `<span data-show="nl">${nl}</span><span data-show="en">${en || nl}</span>`
const arrow = '<span class="arr" aria-hidden="true">→</span>'

const NAV = [
  ['home', '/', 'Home', 'Home'],
  ['about', '/about.html', 'Over ons', 'About'],
  ['services', '/services.html', 'Diensten', 'Services'],
  ['roster', '/roster.html', 'Roster', 'Roster'],
  ['news', '/blog', 'Nieuws', 'News'],
  ['contact', '/contact.html', 'Contact', 'Contact'],
]

const SOCIAL_LABELS = { instagram: 'Instagram', spotify: 'Spotify', youtube: 'YouTube', tiktok: 'TikTok', linkedin: 'LinkedIn', website: 'Website' }

export function socialLinks(links, cls = 'socials') {
  const items = Object.entries(links || {}).filter(([k, v]) => SOCIAL_LABELS[k] && /^https:\/\//.test(v || ''))
  if (!items.length) return ''
  return `<ul class="${cls}">${items
    .map(([k, v]) => `<li><a href="${esc(v)}" target="_blank" rel="noopener noreferrer">${SOCIAL_LABELS[k]}</a></li>`)
    .join('')}</ul>`
}

function announcementBar(a) {
  if (!a?.enabled || !(a.text_nl || a.text_en)) return ''
  const id = crypto.createHash('md5').update(`${a.text_nl}|${a.text_en}|${a.link}`).digest('hex').slice(0, 8)
  const text = bi(a.text_nl, a.text_en)
  const inner = a.link ? `<a href="${esc(a.link)}">${text} ${arrow}</a>` : text
  return `<div class="announce" data-announce="${id}"><div class="wrap announce-inner"><p>${inner}</p><button type="button" class="announce-close" data-aria-nl="Melding sluiten" data-aria-en="Close notice" aria-label="Melding sluiten">×</button></div></div>`
}

const LANG_INIT = `(function(){var d=document.documentElement,l;try{l=new URLSearchParams(location.search).get('lang')||localStorage.getItem('elev8_lang')}catch(e){}if(l!=='nl'&&l!=='en'){l=(navigator.language||'').toLowerCase().indexOf('nl')===0?'nl':'en'}d.setAttribute('data-lang',l);d.setAttribute('lang',l)})();`

export function layout(o) {
  const { meta = {}, main, nonce, settings = {}, gaId, noindex, jsonLd } = o
  const title = meta.title || BRAND
  const desc = meta.description || ''
  const url = BASE_URL + (meta.path || '/')
  const ogImage = meta.ogImage || `${BASE_URL}/og-image.jpg`
  const year = new Date().getFullYear()
  const nav = NAV.map(
    ([key, href, nl, en]) =>
      `<li><a href="${href}"${meta.nav === key ? ' aria-current="page"' : ''}>${bi(nl, en)}</a></li>`,
  ).join('')
  const footerNav = NAV.map(([, href, nl, en]) => `<li><a href="${href}">${bi(nl, en)}</a></li>`).join('')

  return `<!DOCTYPE html>
<html lang="nl" data-lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#090908">
${noindex ? '<meta name="robots" content="noindex, nofollow">\n' : ''}<meta property="og:title" content="${esc(meta.ogTitle || title)}">
<meta property="og:description" content="${esc(meta.ogDescription || desc)}">
<meta property="og:type" content="${meta.ogType || 'website'}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="S&amp;S ELEV8 Entertainment">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(ogImage)}">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="application/rss+xml" title="S&amp;S ELEV8 nieuws" href="/feed.xml">
<script nonce="${nonce}">${LANG_INIT}</script>
${gaId ? `<script nonce="${nonce}">window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'});window.ELEV8_GA='${gaId}';</script>\n` : ''}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800;900&family=Manrope:wght@400;500;600&family=Pinyon+Script&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css?v=${assets.css}">
${jsonLd ? `<script type="application/ld+json" nonce="${nonce}">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>\n` : ''}</head>
<body class="page-${esc(meta.nav || 'other')}">
<a class="skip" href="#main">${bi('Naar de inhoud', 'Skip to content')}</a>
<header class="site-header">
${announcementBar(settings.announcement)}<nav class="nav wrap" aria-label="Hoofdmenu">
<a class="nav-logo" href="/" aria-label="S&amp;S ELEV8 Entertainment, home"><img src="/logo.png" alt="S&amp;S ELEV8 Entertainment" width="55" height="52"></a>
<ul class="nav-menu" id="nav-menu">${nav}</ul>
<div class="nav-side">
<div class="lang-toggle" role="group" aria-label="Taal"><button type="button" data-set-lang="nl" aria-pressed="false">NL</button><button type="button" data-set-lang="en" aria-pressed="false">EN</button></div>
<button type="button" class="nav-toggle" aria-controls="nav-menu" aria-expanded="false" data-aria-nl="Menu openen" data-aria-en="Open menu" aria-label="Menu openen"><span></span><span></span></button>
</div>
</nav>
</header>
<main id="main">
${main}
</main>
<footer class="site-footer">
<div class="wrap footer-grid">
<div class="footer-brand">
<img src="/logo.png" alt="" width="68" height="64" loading="lazy">
<p class="footer-tag">${bi('Van visie naar realiteit.', 'From vision to reality.')}</p>
<a class="footer-mail" href="mailto:info@elev8entertainment.nl">info@elev8entertainment.nl</a>
${socialLinks(settings.socials)}
</div>
<div class="footer-nav">
<h2 class="kicker">Menu</h2>
<ul>${footerNav}</ul>
</div>
<div class="footer-news">
<h2 class="kicker">${bi('Nieuwsbrief', 'Newsletter')}</h2>
<p>${bi('Updates over releases, events en nieuws. Geen spam, altijd af te melden.', 'Updates on releases, events and news. No spam, unsubscribe any time.')}</p>
<form class="subscribe" data-subscribe novalidate>
<label class="sr-only" for="sub-email">E-mail</label>
<input type="email" id="sub-email" name="email" required autocomplete="email" placeholder="jouw@email.nl" data-placeholder-nl="jouw@email.nl" data-placeholder-en="your@email.com">
<input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
<button type="submit" class="btn">${bi('Aanmelden', 'Subscribe')}</button>
<p class="form-msg" role="status" aria-live="polite"></p>
</form>
</div>
</div>
<div class="wrap footer-bottom">
<span>© ${year} S&amp;S ELEV8 Entertainment</span>
<span class="footer-links"><a href="/privacy">${bi('Privacy', 'Privacy')}</a>${gaId ? `<button type="button" data-consent-open>${bi('Cookie-instellingen', 'Cookie settings')}</button>` : ''}</span>
</div>
</footer>
${gaId ? `<div class="consent" role="dialog" aria-modal="false" aria-labelledby="consent-title" data-consent hidden>
<p id="consent-title">${bi('Wij gebruiken graag Google Analytics om te zien hoe de site bezocht wordt. Dat plaatst cookies, en alleen als jij akkoord gaat.', 'We would like to use Google Analytics to see how the site is visited. That sets cookies, and only if you agree.')} <a href="/privacy">${bi('Meer weten', 'Learn more')}</a></p>
<div class="consent-actions"><button type="button" class="btn" data-consent-accept>${bi('Akkoord', 'Accept')}</button><button type="button" class="btn-quiet" data-consent-decline>${bi('Liever niet', 'No thanks')}</button></div>
</div>
` : ''}<script src="/script.js?v=${assets.js}" defer></script>
</body>
</html>`
}

const iso = (ts) => new Date(ts).toISOString()
const postTitle = (p) => bi(p.title_nl, p.title_en)
const postExcerpt = (p) => bi(p.excerpt_nl, p.excerpt_en)
const postDate = (p) => `<time datetime="${iso(p.published_at || p.created_at)}">${bi(formatDate(p.published_at || p.created_at, 'nl'), formatDate(p.published_at || p.created_at, 'en'))}</time>`
const thumb = (url) => (url && url.startsWith('/uploads/') ? url.replace(/\.webp$/, '-800.webp') : url)

export function postCard(p, lead = false) {
  const img = p.cover
    ? `<figure class="post-card-img"><img src="${esc(lead ? p.cover : thumb(p.cover))}" alt="" loading="lazy" width="1200" height="800"></figure>`
    : '<figure class="post-card-img is-empty"><img src="/logo.png" alt="" loading="lazy" width="200" height="188"></figure>'
  return `<article class="post-card${lead ? ' is-lead' : ''}"><a class="post-card-link" href="/blog/${esc(p.slug)}">${img}<div class="post-card-body"><p class="post-meta">${postDate(p)}</p><h3 class="post-card-title">${postTitle(p)}</h3>${p.excerpt_nl ? `<p class="post-card-excerpt">${postExcerpt(p)}</p>` : ''}<span class="link-arrow">${bi('Lees verder', 'Read more')} ${arrow}</span></div></a></article>`
}

export function newsSection(posts) {
  if (!posts.length) return ''
  return `<section class="section news" aria-labelledby="news-title">
<div class="wrap">
<div class="section-head">
<div><p class="kicker">${bi('Nieuws', 'News')}</p>
<h2 class="title" id="news-title"><span class="line">${bi('Het laatste', 'The latest')}</span><em>${bi('nieuws.', 'news.')}</em></h2></div>
<a class="link-arrow" href="/blog">${bi('Alle berichten', 'All posts')} ${arrow}</a>
</div>
<div class="news-grid">${posts.map((p, i) => postCard(p, i === 0)).join('')}</div>
</div>
</section>`
}

export function postsGrid(posts) {
  if (!posts.length) {
    return `<p class="lead empty">${bi('Binnenkort verschijnen hier de eerste berichten.', 'The first posts will appear here soon.')}</p>`
  }
  return `<div class="news-grid">${posts.map((p, i) => postCard(p, i === 0)).join('')}</div>`
}

const artistLinks = (a) => {
  let links = {}
  try {
    links = JSON.parse(a.links || '{}')
  } catch {
    /* ignore */
  }
  return socialLinks(links, 'artist-links')
}

export function artistFeature(a, { flip = false, headingTag = 'h2', more = false } = {}) {
  const since = a.since ? `<p class="kicker">${bi(`Sinds ${a.since}`, `Since ${a.since}`)}</p>` : ''
  return `<article class="feature${flip ? ' flip' : ''}" id="${esc(a.slug)}">
<figure class="feature-photo">${a.photo ? `<img src="${esc(a.photo)}" alt="${esc(a.name)}" loading="lazy" width="1200" height="1200">` : ''}</figure>
<div class="feature-text">
${since}<${headingTag} class="feature-name">${esc(a.name)}</${headingTag}>
${a.tagline_nl ? `<p class="feature-tagline">${bi(a.tagline_nl, a.tagline_en)}</p>` : ''}
${a.bio_nl ? `<p class="feature-bio">${bi(a.bio_nl, a.bio_en)}</p>` : ''}
${artistLinks(a)}
<div class="actions">
${more ? `<a class="btn" href="/roster.html#${esc(a.slug)}">${bi('Bekijk het roster', 'View the roster')} ${arrow}</a>` : `<a class="btn" href="/contact.html?topic=booking&amp;artist=${encodeURIComponent(a.slug)}#form">${bi('Booking aanvragen', 'Booking inquiry')} ${arrow}</a>`}
</div>
</div>
</article>`
}

export function featuredSection(a) {
  if (!a) return ''
  return `<section class="section featured" aria-label="Featured">
<div class="wrap">
<p class="kicker">${bi('Uitgelicht', 'Featured')}</p>
${artistFeature(a, { more: true })}
</div>
</section>`
}

export function rosterSection(artists) {
  if (!artists.length) return ''
  return `<section class="section roster-list"><div class="wrap roster-stack">${artists
    .map((a, i) => artistFeature(a, { flip: i % 2 === 1 }))
    .join('')}</div></section>`
}

export function postPage(p, { draft = false, more = [] } = {}) {
  const cover = p.cover
    ? `<figure class="post-cover wrap"><img src="${esc(p.cover)}" alt="" width="2000" height="1125" fetchpriority="high"></figure>`
    : ''
  // Without an English body, show the Dutch one to everyone instead of duplicating it in a hidden span.
  const nlBody = `<div class="prose">${markdown(p.body_nl)}</div>`
  const body = p.body_en ? biHtml(nlBody, `<div class="prose">${markdown(p.body_en)}</div>`) : nlBody
  const shareText = encodeURIComponent(`${p.title_nl} ${BASE_URL}/blog/${p.slug}`)
  return `${draft ? `<div class="draft-note">${bi('Concept, alleen zichtbaar voor ingelogde founders.', 'Draft, only visible to signed-in founders.')}</div>` : ''}<article class="post">
<header class="post-header wrap-narrow">
<p class="kicker"><a href="/blog">${bi('Nieuws', 'News')}</a> · ${postDate(p)}</p>
<h1 class="post-title">${postTitle(p)}</h1>
${p.excerpt_nl ? `<p class="lead">${postExcerpt(p)}</p>` : ''}
</header>
${cover}
<div class="wrap-narrow post-body">${body}</div>
<footer class="wrap-narrow post-footer">
<div class="share"><span class="kicker">${bi('Delen', 'Share')}</span><a href="https://wa.me/?text=${shareText}" target="_blank" rel="noopener noreferrer">WhatsApp</a><button type="button" data-copy-link>${bi('Kopieer link', 'Copy link')}</button></div>
<a class="link-arrow" href="/blog">${bi('Alle berichten', 'All posts')} ${arrow}</a>
</footer>
</article>
${more.length ? `<section class="section tint"><div class="wrap"><div class="section-head"><h2 class="title"><span class="line">${bi('Meer', 'More')}</span><em>${bi('nieuws.', 'news.')}</em></h2></div><div class="news-grid">${more.map((m) => postCard(m)).join('')}</div></div></section>` : ''}`
}

export function simplePage(kicker, lineNl, lineEn, emNl, emEn, bodyHtml) {
  return `<section class="page-hero"><div class="wrap">
<p class="kicker">${kicker}</p>
<h1 class="display"><span class="line">${bi(lineNl, lineEn)}</span><em>${bi(emNl, emEn)}</em></h1>
${bodyHtml}
</div></section>`
}
