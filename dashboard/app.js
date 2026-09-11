const $ = (s, root = document) => root.querySelector(s)
const $$ = (s, root = document) => [...root.querySelectorAll(s)]
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c])
const nf = new Intl.NumberFormat('nl-NL')
const dateFmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' })
const fmtDate = (ts) => (ts ? dateFmt.format(new Date(ts)) : '')
const fmtDateTime = (ts) => (ts ? dateTimeFmt.format(new Date(ts)) : '')
const parseDay = (d) => {
  const [y, m, dd] = d.split('-').map(Number)
  return new Date(y, m - 1, dd)
}
const dayLabel = (d) => dayFmt.format(parseDay(d))
const toLocalInput = (ts) => {
  const d = new Date(ts)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
const thumbOf = (url) => (url && url.startsWith('/uploads/') ? url.replace(/\.webp$/, '-800.webp') : url)

const app = $('#app')
let me = null
let dirty = false
let lastHash = location.hash
let ignoreHash = false

// ---------- api ----------
async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, headers: {}, credentials: 'same-origin' }
  if (form) opts.body = form
  else if (body !== undefined) {
    opts.headers['content-type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  let res
  try {
    res = await fetch(`/api/admin${path}`, opts)
  } catch {
    throw Object.assign(new Error('Geen verbinding. Controleer je internet en probeer het opnieuw.'), { offline: true })
  }
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && !['/login', '/me'].includes(path)) {
    me = null
    dirty = false
    renderLogin('Je sessie is verlopen. Log opnieuw in.')
    throw new Error('Niet ingelogd.')
  }
  if (!res.ok) throw new Error(data.error || 'Er ging iets mis.')
  return data
}

function toast(msg, err = false) {
  const el = document.createElement('div')
  el.className = `toast${err ? ' err' : ''}`
  el.textContent = msg
  $('.toasts').append(el)
  setTimeout(() => el.remove(), 4000)
}

async function uploadImage(file) {
  if (!file) return null
  if (file.size > 12 * 1024 * 1024) throw new Error('Die foto is te groot (maximaal 12 MB).')
  const form = new FormData()
  form.append('image', file)
  return api('/upload', { method: 'POST', form })
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy]')
  if (!b) return
  navigator.clipboard?.writeText(b.dataset.copy).then(
    () => toast('Link gekopieerd'),
    () => window.prompt('Kopieer deze link:', b.dataset.copy),
  )
})

window.addEventListener('beforeunload', (e) => {
  if (dirty) {
    e.preventDefault()
    e.returnValue = ''
  }
})

// ---------- auth screens ----------
function renderLogin(notice = '') {
  document.title = 'Inloggen | S&S ELEV8'
  app.innerHTML = `<div class="auth"><form class="card auth-card" data-login novalidate>
    <img class="auth-logo" src="/logo.png" alt="S&amp;S ELEV8">
    <h1>Dashboard</h1>
    <p>Log in om het nieuws, het roster en de berichten te beheren.</p>
    <div class="field"><label for="l-email">E-mailadres</label><input id="l-email" name="email" type="email" autocomplete="username" required></div>
    <div class="field"><label for="l-pass">Wachtwoord</label><input id="l-pass" name="password" type="password" autocomplete="current-password" required></div>
    <button class="btn wide" type="submit">Inloggen</button>
    <p class="form-error" role="alert">${esc(notice)}</p>
    <p class="hint">Wachtwoord vergeten? Vraag je mede-founder om via Account een nieuwe link voor je te maken.</p>
  </form></div>`
  const form = $('[data-login]')
  form.email.focus()
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = $('button', form)
    btn.disabled = true
    try {
      await api('/login', { method: 'POST', body: { email: form.email.value.trim(), password: form.password.value } })
      await boot()
    } catch (err) {
      $('.form-error', form).textContent = err.message
    } finally {
      btn.disabled = false
    }
  })
}

async function renderTokenPage(token) {
  let info
  try {
    info = await api(`/token?token=${encodeURIComponent(token)}`)
  } catch (err) {
    app.innerHTML = `<div class="auth"><div class="card auth-card"><img class="auth-logo" src="/logo.png" alt="S&amp;S ELEV8"><h1>Link verlopen</h1><p>${esc(err.message)}</p><a class="btn wide" href="/dashboard/">Naar inloggen</a></div></div>`
    return
  }
  const setup = info.kind === 'setup'
  app.innerHTML = `<div class="auth"><form class="card auth-card" data-token novalidate>
    <img class="auth-logo" src="/logo.png" alt="S&amp;S ELEV8">
    <h1>${setup ? `Welkom, ${esc(info.name.split(' ')[0])}` : 'Nieuw wachtwoord'}</h1>
    <p>${setup ? 'Kies een wachtwoord voor' : 'Kies een nieuw wachtwoord voor'} <strong>${esc(info.email)}</strong>. Minstens 10 tekens.</p>
    <div class="field"><label for="t-pass">Wachtwoord</label><input id="t-pass" name="password" type="password" autocomplete="new-password" minlength="10" required></div>
    <div class="field"><label for="t-pass2">Nog een keer</label><input id="t-pass2" name="password2" type="password" autocomplete="new-password" minlength="10" required></div>
    <button class="btn wide" type="submit">${setup ? 'Account activeren' : 'Wachtwoord opslaan'}</button>
    <p class="form-error" role="alert"></p>
  </form></div>`
  const form = $('[data-token]')
  form.password.focus()
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const err = $('.form-error', form)
    if (form.password.value.length < 10) return (err.textContent = 'Kies een wachtwoord van minstens 10 tekens.')
    if (form.password.value !== form.password2.value) return (err.textContent = 'De twee wachtwoorden zijn niet hetzelfde.')
    try {
      await api('/token', { method: 'POST', body: { token, password: form.password.value } })
      history.replaceState(null, '', '/dashboard/')
      await boot()
      toast(setup ? 'Je account is actief. Welkom!' : 'Je nieuwe wachtwoord is opgeslagen.')
    } catch (e2) {
      err.textContent = e2.message
    }
  })
}

function renderOffline() {
  app.innerHTML = `<div class="auth"><div class="card auth-card"><img class="auth-logo" src="/logo.png" alt="S&amp;S ELEV8"><h1>Geen verbinding</h1><p>Het dashboard heeft internet nodig om je gegevens op te halen. Zodra je weer online bent, gaat het vanzelf verder.</p><button class="btn wide" type="button" data-retry>Opnieuw proberen</button></div></div>`
  $('[data-retry]').addEventListener('click', boot)
  window.addEventListener('online', boot, { once: true })
}

// ---------- install as app ----------
let installEvent = null
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

function installHtml(dismissible) {
  if (isStandalone()) return ''
  if (dismissible && localStorage.getItem('elev8_install_hidden')) return ''
  const ios = isIOS()
  if (!ios && !installEvent) return ''
  return `<section class="card install" data-install-card><div><h2>Dashboard als app</h2><p class="muted-text">${
    ios
      ? 'Tik in Safari op het deelicoon en kies Zet op beginscherm. Dan open je het dashboard voortaan met één tik, met het ELEV8-logo als icoon.'
      : 'Zet het dashboard als app op je telefoon of computer, met het ELEV8-logo als icoon.'
  }</p></div><div class="install-actions">${ios ? '' : '<button type="button" class="btn" data-install>Installeer als app</button>'}${dismissible ? '<button type="button" class="link" data-install-hide>Niet nu</button>' : ''}</div></section>`
}

function paintInstall() {
  $$('[data-install-slot]').forEach((slot) => {
    slot.innerHTML = installHtml(slot.dataset.installSlot === 'dismissible')
    $('[data-install]', slot)?.addEventListener('click', async () => {
      if (!installEvent) return
      installEvent.prompt()
      const choice = await installEvent.userChoice
      installEvent = null
      if (choice.outcome === 'accepted') toast('Het dashboard staat nu als app op je apparaat')
      paintInstall()
    })
    $('[data-install-hide]', slot)?.addEventListener('click', () => {
      localStorage.setItem('elev8_install_hidden', '1')
      paintInstall()
    })
  })
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  installEvent = e
  paintInstall()
})
window.addEventListener('appinstalled', () => {
  installEvent = null
  paintInstall()
})

// ---------- shell & routing ----------
const NAV = [
  ['overzicht', '#/', 'Overzicht'],
  ['nieuws', '#/nieuws', 'Nieuws'],
  ['roster', '#/roster', 'Roster'],
  ['berichten', '#/berichten', 'Berichten'],
  ['nieuwsbrief', '#/nieuwsbrief', 'Nieuwsbrief'],
  ['instellingen', '#/instellingen', 'Instellingen'],
  ['account', '#/account', 'Account'],
]

const ROUTES = [
  [/^#\/?$/, viewOverview, 'overzicht', 'Overzicht'],
  [/^#\/nieuws$/, viewPosts, 'nieuws', 'Nieuws'],
  [/^#\/nieuws\/(nieuw|\d+)$/, viewPostEditor, 'nieuws', 'Nieuws'],
  [/^#\/roster$/, viewArtists, 'roster', 'Roster'],
  [/^#\/roster\/(nieuw|\d+)$/, viewArtistEditor, 'roster', 'Roster'],
  [/^#\/berichten$/, viewMessages, 'berichten', 'Berichten'],
  [/^#\/nieuwsbrief$/, viewSubscribers, 'nieuwsbrief', 'Nieuwsbrief'],
  [/^#\/instellingen$/, viewSettings, 'instellingen', 'Instellingen'],
  [/^#\/account$/, viewAccount, 'account', 'Account'],
]

function renderShell() {
  app.innerHTML = `<div class="shell">
    <aside class="side">
      <a class="brand" href="#/"><img src="/logo.png" alt="S&amp;S ELEV8"><span>Dashboard</span></a>
      <nav aria-label="Dashboard">${NAV.map(([key, href, label]) => `<a href="${href}" data-nav="${key}">${label}<span class="count" data-count="${key}"></span></a>`).join('')}</nav>
      <div class="side-foot">
        <span class="who">${esc(me.user.name)}</span>
        <a class="view-site" href="/" target="_blank" rel="noopener">Bekijk de site ↗</a>
        <button type="button" data-logout>Uitloggen</button>
      </div>
    </aside>
    <main class="main">
      ${me.staging ? '<p class="staging">Testomgeving. Wat je hier doet, komt niet op de echte website.</p>' : ''}
      <div id="view" tabindex="-1"></div>
    </main>
  </div>`
  $('[data-logout]').addEventListener('click', async () => {
    if (dirty && !confirm('Je hebt wijzigingen die nog niet zijn opgeslagen. Toch uitloggen?')) return
    dirty = false
    await api('/logout', { method: 'POST' }).catch(() => {})
    location.href = '/dashboard/'
  })
}

async function refreshCounts() {
  try {
    const o = await api('/overview')
    const el = $('[data-count="berichten"]')
    if (el) el.textContent = o.counts.unread ? String(o.counts.unread) : ''
  } catch {
    /* counts are cosmetic */
  }
}

function onHashChange() {
  if (ignoreHash) {
    ignoreHash = false
    return
  }
  if (dirty && !confirm('Je hebt wijzigingen die nog niet zijn opgeslagen. Toch doorgaan?')) {
    ignoreHash = true
    location.hash = lastHash
    return
  }
  dirty = false
  route()
}

async function route() {
  lastHash = location.hash || '#/'
  for (const [re, view, key, title] of ROUTES) {
    const m = lastHash.match(re)
    if (!m) continue
    $$('.side nav a').forEach((a) => a.classList.toggle('is-active', a.dataset.nav === key))
    document.title = `${title} | Dashboard S&S ELEV8`
    const el = $('#view')
    el.innerHTML = '<p class="loading">Laden…</p>'
    try {
      await view(el, m[1])
    } catch (e) {
      if (me) el.innerHTML = `<div class="card"><p class="form-error">${esc(e.message)}</p></div>`
    }
    el.focus({ preventScroll: true })
    window.scrollTo(0, 0)
    return
  }
  location.hash = '#/'
}

async function boot() {
  const token = new URLSearchParams(location.search).get('token')
  if (token) return renderTokenPage(token)
  try {
    me = await api('/me')
  } catch (e) {
    return e.offline ? renderOffline() : renderLogin()
  }
  renderShell()
  window.removeEventListener('hashchange', onHashChange)
  window.addEventListener('hashchange', onHashChange)
  refreshCounts()
  route()
}

// ---------- building blocks ----------
const pageHead = (title, sub = '', actions = '') =>
  `<header class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</header>`

const kpi = (label, value, sub = '', href = '') => {
  const tag = href ? `a href="${href}"` : 'div'
  const shown = typeof value === 'number' ? nf.format(value) : esc(value)
  return `<${tag} class="kpi"><div class="label">${esc(label)}</div><div class="value">${shown}</div><div class="sub">${esc(sub)}</div></${href ? 'a' : 'div'}>`
}

const emptyState = (title, text, href = '', cta = '') =>
  `<div class="card empty"><h2>${esc(title)}</h2><p>${esc(text)}</p>${href ? `<a class="btn" href="${href}">${esc(cta)}</a>` : ''}</div>`

function niceMax(v) {
  if (v <= 4) return 4
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p
  return 10 * p
}

// Single series, so one validated gold and no legend: the card title names it.
function barChart(rows, unit, label) {
  const W = 720
  const H = 220
  const L = 36
  const B = 26
  const T = 10
  const pw = W - L
  const ph = H - B - T
  const max = niceMax(Math.max(0, ...rows.map((r) => r.value)))
  const step = pw / rows.length
  const gap = 2
  const bw = Math.max(1, step - gap)
  const grid = [0, max / 2, max]
    .map((t) => {
      const y = T + ph - (t / max) * ph
      return `<line class="grid-line" x1="${L}" x2="${W}" y1="${y}" y2="${y}"/><text class="axis-label" x="${L - 8}" y="${y + 4}" text-anchor="end">${nf.format(t)}</text>`
    })
    .join('')
  const cols = rows
    .map((r, i) => {
      const x = L + i * step + gap / 2
      const h = (r.value / max) * ph
      const y = T + ph - h
      const rad = Math.min(4, bw / 2, h)
      const bar =
        h > 0
          ? `<path class="bar" d="M${x},${T + ph} V${y + rad} Q${x},${y} ${x + rad},${y} H${x + bw - rad} Q${x + bw},${y} ${x + bw},${y + rad} V${T + ph} Z"/>`
          : ''
      const tip = `${dayLabel(r.day)}: ${nf.format(r.value)} ${unit}`
      return `<g class="col" tabindex="0" data-tip="${esc(tip)}" aria-label="${esc(tip)}"><rect class="hit" x="${L + i * step}" y="${T}" width="${step}" height="${ph}"/>${bar}</g>`
    })
    .join('')
  const every = Math.ceil(rows.length / 6)
  const xLabels = rows
    .map((r, i) =>
      i % every === 0 ? `<text class="axis-label" x="${L + i * step + step / 2}" y="${H - 6}" text-anchor="middle">${esc(dayLabel(r.day))}</text>` : '',
    )
    .join('')
  const total = rows.reduce((s, r) => s + r.value, 0)
  return `<div class="chart" data-chart><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${label}: ${nf.format(total)} ${unit} in ${rows.length} dagen`)}">${grid}${cols}${xLabels}</svg></div>
  <details class="table-view"><summary>Bekijk als tabel</summary><table><thead><tr><th>Dag</th><th>${esc(unit)}</th></tr></thead><tbody>${rows
    .map((r) => `<tr><td>${esc(dayLabel(r.day))}</td><td>${nf.format(r.value)}</td></tr>`)
    .join('')}</tbody></table></details>`
}

function wireCharts(root) {
  $$('[data-chart]', root).forEach((chart) => {
    const tip = document.createElement('div')
    tip.className = 'tip'
    tip.hidden = true
    chart.append(tip)
    const show = (g) => {
      const c = chart.getBoundingClientRect()
      const r = g.getBoundingClientRect()
      const bar = $('.bar', g)
      tip.textContent = g.dataset.tip
      tip.hidden = false
      tip.style.left = `${r.left - c.left + r.width / 2}px`
      tip.style.top = `${(bar ? bar.getBoundingClientRect().top : r.bottom) - c.top}px`
    }
    const hide = () => (tip.hidden = true)
    $$('.col', chart).forEach((g) => {
      g.addEventListener('mouseenter', () => show(g))
      g.addEventListener('focus', () => show(g))
      g.addEventListener('mouseleave', hide)
      g.addEventListener('blur', hide)
    })
  })
}

function rankList(title, items, empty) {
  const max = Math.max(1, ...items.map((i) => i.value))
  const body = items.length
    ? `<ol class="rank">${items
        .map(
          (i) =>
            `<li><div class="rank-top"><span class="rank-label">${i.href ? `<a href="${i.href}">${esc(i.label)}</a>` : esc(i.label)}</span><span class="rank-val">${nf.format(i.value)}</span></div><div class="rank-track"><div class="rank-fill" style="width:${Math.max(2, (i.value / max) * 100).toFixed(1)}%"></div></div></li>`,
        )
        .join('')}</ol>`
    : `<p class="muted-text" style="margin-top:14px">${esc(empty)}</p>`
  return `<h2>${esc(title)}</h2>${body}`
}

const PAGE_NAMES = { '/': 'Home', '/about.html': 'Over ons', '/services.html': 'Diensten', '/roster.html': 'Roster', '/contact.html': 'Contact', '/blog': 'Nieuwsoverzicht' }
const pageLabel = (p) => PAGE_NAMES[p] || (p.startsWith('/blog/') ? `Nieuws: ${p.slice(6)}` : p)

// ---------- overview ----------
async function viewOverview(el) {
  const o = await api('/overview')
  const first = esc((me.user.name || '').split(' ')[0])
  el.innerHTML = `${pageHead('Overzicht', `Welkom${first ? `, ${first}` : ''}. Zo gaat het met de site.`, '<a class="btn" href="#/nieuws/nieuw">Nieuw bericht</a>')}
  <div data-install-slot="dismissible"></div>
  <section class="grid-kpi">
    ${kpi('Paginaweergaven', o.views7, 'laatste 7 dagen')}
    ${kpi('Paginaweergaven', o.views30, 'laatste 30 dagen')}
    ${kpi('Nieuws online', o.counts.published, o.counts.drafts ? `${o.counts.drafts} ${o.counts.drafts === 1 ? 'concept' : 'concepten'}` : 'berichten', '#/nieuws')}
    ${kpi('Nieuwe berichten', o.counts.unread, 'via het contactformulier', '#/berichten')}
    ${kpi('Nieuwsbrief', o.counts.subscribers, 'aanmeldingen', '#/nieuwsbrief')}
  </section>
  <section class="card">
    <div class="card-head"><h2>Paginaweergaven per dag</h2><span class="hint">Laatste 30 dagen. Eigen telling, zonder cookies.</span></div>
    ${barChart(o.daily, 'weergaven', 'Paginaweergaven per dag')}
  </section>
  <section class="grid-2">
    <div class="card">${rankList("Meest bekeken pagina's", o.topPages.map((p) => ({ label: pageLabel(p.label), value: p.value })), 'Nog geen bezoekers geteld.')}</div>
    <div class="card">${rankList('Meest gelezen nieuws', o.topPosts.map((p) => ({ label: p.title_nl || 'Zonder titel', value: p.views, href: `#/nieuws/${p.id}` })), 'Nog geen gepubliceerde berichten.')}</div>
  </section>
  <section class="card">
    <div class="card-head"><h2>Laatste berichten</h2><a class="link" href="#/berichten">Alle berichten</a></div>
    ${
      o.recentMessages.length
        ? `<div class="list">${o.recentMessages
            .map(
              (m) =>
                `<a class="row no-thumb" href="#/berichten"><div class="row-main"><strong>${esc(m.name)}</strong><span class="row-sub">${m.handled_at ? '<span class="badge muted">Afgehandeld</span>' : '<span class="badge warn">Nieuw</span>'}${esc(m.topic)}</span></div><div class="row-meta">${fmtDateTime(m.created_at)}</div></a>`,
            )
            .join('')}</div>`
        : '<p class="muted-text">Nog geen berichten.</p>'
    }
  </section>
  <section data-ga></section>`
  wireCharts(el)
  paintInstall()
  loadGa($('[data-ga]', el), 30)
}

const CHANNELS = {
  Direct: 'Direct',
  'Organic Search': 'Zoekmachines',
  'Organic Social': 'Social media',
  Referral: 'Andere websites',
  Email: 'E-mail',
  'Paid Search': 'Betaalde zoekadvertenties',
  'Paid Social': 'Betaalde social media',
  'Organic Video': 'Video',
  Unassigned: 'Onbekend',
}
const DEVICES = { desktop: 'Computer', mobile: 'Telefoon', tablet: 'Tablet' }

async function loadGa(el, days) {
  if (!me.ga.reporting) {
    el.innerHTML = `<div class="card"><h2>Google Analytics</h2><p class="muted-text" style="margin-top:8px">${
      me.ga.measurement
        ? 'De meting staat aan, met cookiebanner. De cijfers van Google verschijnen hier zodra de koppeling is gemaakt.'
        : 'Google Analytics is nog niet ingesteld. Tot die tijd zie je hierboven de eigen telling, zonder cookies.'
    }</p></div>`
    return
  }
  el.innerHTML = '<div class="card"><p class="loading">Google Analytics laden…</p></div>'
  const g = await api(`/ga?days=${days}`).catch((e) => ({ error: e.message }))
  if (g.error || !g.totals) {
    el.innerHTML = `<div class="card"><h2>Google Analytics</h2><p class="form-error" style="margin-top:8px">De cijfers konden niet worden opgehaald. ${esc(g.error || '')}</p></div>`
    return
  }
  const t = g.totals
  const dur = `${Math.floor(t.avgSeconds / 60)}:${String(t.avgSeconds % 60).padStart(2, '0')}`
  el.innerHTML = `<header class="page-head" style="margin:34px 0 18px"><div><h1 style="font-size:1.8rem">Google Analytics</h1><p>Bezoekers die cookies hebben toegestaan.</p></div>
    <div class="seg" role="group" aria-label="Periode">${[7, 30, 90].map((d) => `<button type="button" data-days="${d}" class="${d === days ? 'is-on' : ''}" aria-pressed="${d === days}">${d} dagen</button>`).join('')}</div></header>
  <section class="grid-kpi">
    ${kpi('Bezoekers', t.users)}
    ${kpi('Bezoeken', t.sessions)}
    ${kpi('Paginaweergaven', t.views)}
    ${kpi('Gemiddelde duur', dur, 'minuten per bezoek')}
  </section>
  <section class="card"><div class="card-head"><h2>Bezoekers per dag</h2></div>${barChart(g.daily, 'bezoekers', 'Bezoekers per dag')}</section>
  <section class="grid-2">
    <div class="card">${rankList('Waar bezoekers vandaan komen', g.sources.map((s) => ({ label: CHANNELS[s.label] || s.label, value: s.value })), 'Nog geen gegevens.')}</div>
    <div class="card">${rankList('Apparaat', g.devices.map((s) => ({ label: DEVICES[s.label] || s.label, value: s.value })), 'Nog geen gegevens.')}</div>
  </section>
  <section class="grid-2">
    <div class="card">${rankList('Landen', g.countries.map((s) => ({ label: s.label, value: s.value })), 'Nog geen gegevens.')}</div>
    <div class="card">${rankList("Pagina's", g.pages.map((s) => ({ label: pageLabel(s.label), value: s.value })), 'Nog geen gegevens.')}</div>
  </section>`
  wireCharts(el)
  $$('[data-days]', el).forEach((b) => b.addEventListener('click', () => loadGa(el, Number(b.dataset.days))))
}

// ---------- posts ----------
function statusBadge(p) {
  if (p.status !== 'published') return '<span class="badge muted">Concept</span>'
  if (p.published_at > Date.now()) return '<span class="badge warn">Ingepland</span>'
  return '<span class="badge ok">Online</span>'
}

async function viewPosts(el) {
  const posts = await api('/posts')
  el.innerHTML =
    pageHead('Nieuws', 'Updates voor je lezers. Ze verschijnen op de homepage en op de nieuwspagina.', '<a class="btn" href="#/nieuws/nieuw">Nieuw bericht</a>') +
    (posts.length
      ? `<div class="card list">${posts
          .map(
            (p) =>
              `<a class="row" href="#/nieuws/${p.id}"><div class="row-thumb">${p.cover ? `<img src="${esc(thumbOf(p.cover))}" alt="">` : ''}</div><div class="row-main"><strong>${esc(p.title_nl || 'Zonder titel')}</strong><span class="row-sub">${statusBadge(p)}${esc(fmtDate(p.published_at || p.updated_at))}</span></div><div class="row-meta">${p.status === 'published' ? `${nf.format(p.views)} keer gelezen` : ''}</div></a>`,
          )
          .join('')}</div>`
      : emptyState('Nog geen berichten', 'Schrijf je eerste nieuwsbericht. Zodra je publiceert, staat het op de homepage.', '#/nieuws/nieuw', 'Nieuw bericht'))
}

const mdField = (name, label, value) => `<div class="field md" data-md>
  <div class="md-head"><label for="md-${name}">${label}</label><div class="seg" role="group" aria-label="Weergave"><button type="button" class="is-on" data-tab="write">Schrijven</button><button type="button" data-tab="preview">Voorbeeld</button></div></div>
  <div class="md-toolbar" role="toolbar" aria-label="Opmaak">
    <button type="button" data-cmd="bold" title="Vet"><b>B</b></button>
    <button type="button" data-cmd="italic" title="Schuin"><i>I</i></button>
    <button type="button" data-cmd="h2" title="Tussenkop">Kop</button>
    <button type="button" data-cmd="link" title="Link">Link</button>
    <button type="button" data-cmd="list" title="Opsomming">Lijst</button>
    <button type="button" data-cmd="quote" title="Uitgelichte zin">Citaat</button>
    <label title="Foto in de tekst">Foto<input type="file" accept="image/*" hidden data-md-image></label>
  </div>
  <textarea id="md-${name}" name="${name}" rows="16">${esc(value)}</textarea>
  <div class="md-preview prose" hidden></div>
  <p class="hint">Laat een lege regel tussen alinea's. Met Kop maak je een tussenkop.</p>
</div>`

function mdCommand(ta, cmd) {
  const { selectionStart: s, selectionEnd: e, value: v } = ta
  const sel = v.slice(s, e)
  const wrap = (mark, fallback) => {
    const text = sel || fallback
    ta.setRangeText(mark + text + mark, s, e, 'end')
    if (!sel) {
      ta.selectionStart = s + mark.length
      ta.selectionEnd = s + mark.length + text.length
    }
  }
  const prefix = (p) => {
    const start = v.lastIndexOf('\n', s - 1) + 1
    ta.setRangeText(
      v
        .slice(start, e)
        .split('\n')
        .map((l) => p + l)
        .join('\n'),
      start,
      e,
      'end',
    )
  }
  if (cmd === 'bold') wrap('**', 'vette tekst')
  else if (cmd === 'italic') wrap('*', 'schuine tekst')
  else if (cmd === 'h2') prefix('## ')
  else if (cmd === 'list') prefix('- ')
  else if (cmd === 'quote') prefix('> ')
  else if (cmd === 'link') {
    const url = window.prompt('Plak de link (begint met https://)', 'https://')
    if (!url || !/^https?:\/\/\S+$/.test(url.trim())) return
    ta.setRangeText(`[${sel || 'linktekst'}](${url.trim()})`, s, e, 'end')
  }
  ta.focus()
  ta.dispatchEvent(new Event('input', { bubbles: true }))
}

function wireMarkdown(root) {
  $$('[data-md]', root).forEach((box) => {
    const ta = $('textarea', box)
    const preview = $('.md-preview', box)
    $$('[data-cmd]', box).forEach((b) => b.addEventListener('click', () => mdCommand(ta, b.dataset.cmd)))
    $('[data-md-image]', box).addEventListener('change', async (e) => {
      try {
        const img = await uploadImage(e.target.files[0])
        if (img) {
          ta.setRangeText(`\n\n![](${img.url})\n\n`, ta.selectionStart, ta.selectionEnd, 'end')
          ta.dispatchEvent(new Event('input', { bubbles: true }))
          toast('Foto toegevoegd aan de tekst')
        }
      } catch (err) {
        toast(err.message, true)
      }
      e.target.value = ''
    })
    $$('[data-tab]', box).forEach((b) =>
      b.addEventListener('click', async () => {
        const showPreview = b.dataset.tab === 'preview'
        $$('[data-tab]', box).forEach((x) => x.classList.toggle('is-on', x === b))
        ta.hidden = showPreview
        $('.md-toolbar', box).hidden = showPreview
        preview.hidden = !showPreview
        if (showPreview) {
          preview.innerHTML = '<p class="muted-text">Voorbeeld laden…</p>'
          const { html } = await api('/preview', { method: 'POST', body: { markdown: ta.value } })
          preview.innerHTML = html || '<p class="muted-text">Nog geen tekst.</p>'
        }
      }),
    )
  })
}

function wireCover(root, hiddenInput, box, removeBtn, square = false) {
  const paint = () => {
    const url = hiddenInput.value
    box.innerHTML = url ? `<img src="${esc(thumbOf(url))}" alt="">` : 'Nog geen foto'
    box.classList.toggle('is-square', square)
    removeBtn.hidden = !url
  }
  paint()
  $('input[type=file]', root).addEventListener('change', async (e) => {
    box.innerHTML = 'Uploaden…'
    try {
      const img = await uploadImage(e.target.files[0])
      if (img) hiddenInput.value = img.url
      dirty = true
    } catch (err) {
      toast(err.message, true)
    }
    e.target.value = ''
    paint()
  })
  removeBtn.addEventListener('click', () => {
    hiddenInput.value = ''
    dirty = true
    paint()
  })
}

async function viewPostEditor(el, id) {
  const isNew = id === 'nieuw'
  const p = isNew
    ? { status: 'draft', title_nl: '', title_en: '', excerpt_nl: '', excerpt_en: '', body_nl: '', body_en: '', cover: '', published_at: null, slug: '' }
    : await api(`/posts/${id}`)
  const live = p.status === 'published'
  el.innerHTML = `${pageHead(isNew ? 'Nieuw bericht' : 'Bericht bewerken', isNew ? '' : statusBadge(p), '<a class="btn ghost" href="#/nieuws">Terug naar nieuws</a>')}
  <form class="editor" data-post novalidate>
    <div class="editor-main">
      <div class="card">
        <div class="field"><label for="p-title">Titel</label><input id="p-title" name="title_nl" maxlength="200" value="${esc(p.title_nl)}" placeholder="Bijvoorbeeld: KREAM brengt nieuwe single uit"></div>
        <div class="field"><label for="p-excerpt">Korte samenvatting <span class="opt">optioneel, staat in het overzicht en bij het delen van de link</span></label><textarea id="p-excerpt" name="excerpt_nl" rows="2" maxlength="400">${esc(p.excerpt_nl)}</textarea></div>
        <div class="field">${mdField('body_nl', 'Tekst', p.body_nl)}</div>
      </div>
      <details class="card"${p.title_en || p.body_en ? ' open' : ''}>
        <summary>Engelse versie<span class="opt">Optioneel. Zonder Engelse tekst zien Engelse bezoekers de Nederlandse versie.</span></summary>
        <div class="field"><label for="p-title-en">Title</label><input id="p-title-en" name="title_en" maxlength="200" value="${esc(p.title_en)}"></div>
        <div class="field"><label for="p-excerpt-en">Short summary</label><textarea id="p-excerpt-en" name="excerpt_en" rows="2" maxlength="400">${esc(p.excerpt_en)}</textarea></div>
        <div class="field">${mdField('body_en', 'Text', p.body_en)}</div>
      </details>
    </div>
    <aside class="editor-side">
      <div class="card">
        <h3>Omslagfoto</h3>
        <div class="cover" data-cover></div>
        <div class="side-actions">
          <label class="btn ghost file">Foto kiezen<input type="file" accept="image/*" hidden></label>
          <button type="button" class="link danger" data-cover-remove>Weghalen</button>
        </div>
        <input type="hidden" name="cover" value="${esc(p.cover || '')}">
      </div>
      <div class="card">
        <h3>Publiceren</h3>
        <div class="field"><label for="p-date">Datum</label><input type="datetime-local" id="p-date" name="published_at" value="${p.published_at ? toLocalInput(p.published_at) : ''}"><span class="hint">Leeg is nu. Kies je een datum in de toekomst, dan wordt het bericht ingepland.</span></div>
        <div class="field"><label for="p-slug">Webadres</label><div class="slug"><span>/blog/</span><input id="p-slug" name="slug" value="${esc(p.slug)}" placeholder="komt uit de titel"></div></div>
        <div class="stack-btns">
          <button type="submit" class="btn" data-action="published">${live ? 'Wijzigingen publiceren' : 'Publiceren'}</button>
          <button type="submit" class="btn ghost" data-action="draft">${live ? 'Offline halen' : 'Opslaan als concept'}</button>
          ${isNew ? '' : `<a class="btn ghost" href="/blog/${esc(p.slug)}" target="_blank" rel="noopener">Bekijk op de site ↗</a>`}
        </div>
        ${isNew ? '' : '<div class="side-actions"><button type="button" class="link danger" data-delete>Bericht verwijderen</button></div>'}
      </div>
    </aside>
  </form>`
  const form = $('[data-post]', el)
  wireMarkdown(form)
  wireCover($('.editor-side .card', el), form.cover, $('[data-cover]', el), $('[data-cover-remove]', el))
  form.addEventListener('input', () => (dirty = true))
  let action = 'draft'
  $$('[data-action]', form).forEach((b) => b.addEventListener('click', () => (action = b.dataset.action)))
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const v = (n) => form.elements.namedItem(n).value
    const body = {
      title_nl: v('title_nl').trim(),
      title_en: v('title_en').trim(),
      excerpt_nl: v('excerpt_nl').trim(),
      excerpt_en: v('excerpt_en').trim(),
      body_nl: v('body_nl'),
      body_en: v('body_en'),
      cover: v('cover') || null,
      slug: v('slug').trim(),
      status: action,
      published_at: v('published_at') ? new Date(v('published_at')).toISOString() : null,
    }
    $$('button[type=submit]', form).forEach((b) => (b.disabled = true))
    try {
      const saved = await api(isNew ? '/posts' : `/posts/${id}`, { method: isNew ? 'POST' : 'PUT', body })
      dirty = false
      toast(action === 'published' ? (body.published_at && Date.parse(body.published_at) > Date.now() ? 'Ingepland' : 'Gepubliceerd') : 'Opgeslagen als concept')
      if (isNew) location.hash = `#/nieuws/${saved.id}`
      else await viewPostEditor(el, id)
    } catch (err) {
      toast(err.message, true)
    } finally {
      $$('button[type=submit]', form).forEach((b) => (b.disabled = false))
    }
  })
  $('[data-delete]', el)?.addEventListener('click', async () => {
    if (!confirm('Weet je zeker dat je dit bericht wilt verwijderen? Dat kan niet ongedaan worden gemaakt.')) return
    try {
      await api(`/posts/${id}`, { method: 'DELETE' })
      dirty = false
      toast('Bericht verwijderd')
      location.hash = '#/nieuws'
    } catch (err) {
      toast(err.message, true)
    }
  })
}

// ---------- roster ----------
async function viewArtists(el) {
  const artists = await api('/artists')
  el.innerHTML =
    pageHead('Roster', 'De artiesten op de rosterpagina. De uitgelichte artiest staat ook op de homepage.', '<a class="btn" href="#/roster/nieuw">Artiest toevoegen</a>') +
    (artists.length
      ? `<div class="card list">${artists
          .map(
            (a) =>
              `<a class="row" href="#/roster/${a.id}"><div class="row-thumb">${a.photo ? `<img src="${esc(thumbOf(a.photo))}" alt="">` : ''}</div><div class="row-main"><strong>${esc(a.name)}</strong><span class="row-sub">${a.visible ? '<span class="badge ok">Zichtbaar</span>' : '<span class="badge muted">Verborgen</span>'}${a.featured ? '<span class="badge warn">Op de homepage</span>' : ''}${esc(a.tagline_nl)}</span></div><div class="row-meta">${a.since ? `Sinds ${esc(a.since)}` : ''}</div></a>`,
          )
          .join('')}</div>`
      : emptyState('Nog geen artiesten', 'Voeg de eerste artiest toe aan het roster.', '#/roster/nieuw', 'Artiest toevoegen'))
}

async function viewArtistEditor(el, id) {
  const isNew = id === 'nieuw'
  let a
  if (isNew) a = { name: '', tagline_nl: '', tagline_en: '', bio_nl: '', bio_en: '', photo: '', since: '', links: '{}', featured: 0, visible: 1, sort: 0 }
  else a = (await api('/artists')).find((x) => String(x.id) === id)
  if (!a) throw new Error('Artiest niet gevonden.')
  let links = {}
  try {
    links = JSON.parse(a.links || '{}')
  } catch {
    /* ignore */
  }
  const linkField = (k, label) =>
    `<div class="field"><label for="a-${k}">${label}</label><input id="a-${k}" name="link_${k}" inputmode="url" placeholder="https://" value="${esc(links[k] || '')}"></div>`
  el.innerHTML = `${pageHead(isNew ? 'Artiest toevoegen' : a.name, '', '<a class="btn ghost" href="#/roster">Terug naar roster</a>')}
  <form class="editor" data-artist novalidate>
    <div class="editor-main">
      <div class="card">
        <div class="row-2">
          <div class="field"><label for="a-name">Naam</label><input id="a-name" name="name" maxlength="80" value="${esc(a.name)}" required></div>
          <div class="field"><label for="a-since">Bij S&amp;S sinds <span class="opt">bijvoorbeeld 2026</span></label><input id="a-since" name="since" maxlength="20" value="${esc(a.since)}"></div>
        </div>
        <div class="field"><label for="a-tag">Korte omschrijving</label><input id="a-tag" name="tagline_nl" maxlength="200" value="${esc(a.tagline_nl)}" placeholder="Bijvoorbeeld: Soul en elektronisch, uit Amsterdam."></div>
        <div class="field"><label for="a-bio">Bio</label><textarea id="a-bio" name="bio_nl" rows="6" maxlength="3000">${esc(a.bio_nl)}</textarea></div>
      </div>
      <details class="card"${a.tagline_en || a.bio_en ? ' open' : ''}>
        <summary>Engelse versie<span class="opt">Optioneel. Zonder Engelse tekst zien Engelse bezoekers de Nederlandse.</span></summary>
        <div class="field"><label for="a-tag-en">Short description</label><input id="a-tag-en" name="tagline_en" maxlength="200" value="${esc(a.tagline_en)}"></div>
        <div class="field"><label for="a-bio-en">Bio</label><textarea id="a-bio-en" name="bio_en" rows="6" maxlength="3000">${esc(a.bio_en)}</textarea></div>
      </details>
      <div class="card">
        <h3>Links</h3>
        <div class="row-2">${linkField('instagram', 'Instagram')}${linkField('spotify', 'Spotify')}</div>
        <div class="row-2">${linkField('youtube', 'YouTube')}${linkField('tiktok', 'TikTok')}</div>
        ${linkField('website', 'Website')}
      </div>
    </div>
    <aside class="editor-side">
      <div class="card">
        <h3>Foto</h3>
        <div class="cover is-square" data-cover></div>
        <div class="side-actions">
          <label class="btn ghost file">Foto kiezen<input type="file" accept="image/*" hidden></label>
          <button type="button" class="link danger" data-cover-remove>Weghalen</button>
        </div>
        <input type="hidden" name="photo" value="${esc(a.photo || '')}">
      </div>
      <div class="card">
        <h3>Weergave</h3>
        <label class="check"><input type="checkbox" name="visible" ${a.visible ? 'checked' : ''}> Zichtbaar op de site</label>
        <label class="check" style="margin-top:12px"><input type="checkbox" name="featured" ${a.featured ? 'checked' : ''}> Uitlichten op de homepage</label>
        <div class="field" style="margin-top:16px"><label for="a-sort">Volgorde <span class="opt">lager staat eerder</span></label><input id="a-sort" name="sort" type="number" value="${Number(a.sort) || 0}"></div>
        <div class="stack-btns"><button type="submit" class="btn">Opslaan</button></div>
        ${isNew ? '' : '<div class="side-actions"><button type="button" class="link danger" data-delete>Artiest verwijderen</button></div>'}
      </div>
    </aside>
  </form>`
  const form = $('[data-artist]', el)
  wireCover($('.editor-side .card', el), form.photo, $('[data-cover]', el), $('[data-cover-remove]', el), true)
  form.addEventListener('input', () => (dirty = true))
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const f = form.elements
    const body = {
      name: f.namedItem('name').value.trim(),
      since: f.namedItem('since').value.trim(),
      tagline_nl: f.namedItem('tagline_nl').value.trim(),
      tagline_en: f.namedItem('tagline_en').value.trim(),
      bio_nl: f.namedItem('bio_nl').value.trim(),
      bio_en: f.namedItem('bio_en').value.trim(),
      photo: f.namedItem('photo').value || null,
      visible: f.namedItem('visible').checked,
      featured: f.namedItem('featured').checked,
      sort: Number(f.namedItem('sort').value) || 0,
      links: Object.fromEntries(['instagram', 'spotify', 'youtube', 'tiktok', 'website'].map((k) => [k, f.namedItem(`link_${k}`).value.trim()])),
    }
    try {
      const saved = await api(isNew ? '/artists' : `/artists/${id}`, { method: isNew ? 'POST' : 'PUT', body })
      dirty = false
      toast('Opgeslagen')
      location.hash = isNew ? `#/roster/${saved.id}` : '#/roster'
    } catch (err) {
      toast(err.message, true)
    }
  })
  $('[data-delete]', el)?.addEventListener('click', async () => {
    if (!confirm(`Weet je zeker dat je ${a.name} van het roster wilt verwijderen?`)) return
    try {
      await api(`/artists/${id}`, { method: 'DELETE' })
      dirty = false
      toast('Artiest verwijderd')
      location.hash = '#/roster'
    } catch (err) {
      toast(err.message, true)
    }
  })
}

// ---------- messages ----------
async function viewMessages(el) {
  const msgs = await api('/messages')
  const open = msgs.filter((m) => !m.handled_at).length
  el.innerHTML =
    pageHead('Berichten', open ? `${open} ${open === 1 ? 'bericht wacht' : 'berichten wachten'} op een reactie.` : 'Alles wat via het contactformulier binnenkomt.') +
    (msgs.length
      ? msgs
          .map((m) => {
            const subject = encodeURIComponent(`Re: ${m.topic || 'je bericht aan S&S ELEV8'}`)
            return `<article class="card msg${m.handled_at ? ' is-done' : ''}" data-id="${m.id}">
              <div class="msg-head"><div class="who"><strong>${esc(m.name)}</strong><a href="mailto:${esc(m.email)}">${esc(m.email)}</a></div>
              <div class="row-sub">${m.handled_at ? '<span class="badge muted">Afgehandeld</span>' : '<span class="badge warn">Nieuw</span>'}${m.topic ? `<span class="badge">${esc(m.topic)}</span>` : ''}<span>${fmtDateTime(m.created_at)}</span></div></div>
              <p class="msg-body">${esc(m.body)}</p>
              <div class="msg-actions"><a class="btn" href="mailto:${esc(m.email)}?subject=${subject}">Beantwoorden</a>
              <button type="button" class="link" data-toggle>${m.handled_at ? 'Terugzetten naar nieuw' : 'Markeer als afgehandeld'}</button>
              <button type="button" class="link danger" data-remove>Verwijderen</button></div>
            </article>`
          })
          .join('')
      : emptyState('Nog geen berichten', 'Berichten via het contactformulier verschijnen hier.'))
  $$('.msg', el).forEach((card) => {
    const id = card.dataset.id
    const m = msgs.find((x) => String(x.id) === id)
    $('[data-toggle]', card).addEventListener('click', async () => {
      await api(`/messages/${id}`, { method: 'PUT', body: { handled: !m.handled_at } }).catch((e) => toast(e.message, true))
      refreshCounts()
      viewMessages(el)
    })
    $('[data-remove]', card).addEventListener('click', async () => {
      if (!confirm(`Het bericht van ${m.name} verwijderen?`)) return
      await api(`/messages/${id}`, { method: 'DELETE' }).catch((e) => toast(e.message, true))
      refreshCounts()
      viewMessages(el)
    })
  })
}

// ---------- newsletter ----------
async function viewSubscribers(el) {
  const subs = await api('/subscribers')
  const active = subs.filter((s) => !s.unsubscribed_at)
  el.innerHTML =
    pageHead(
      'Nieuwsbrief',
      `${nf.format(active.length)} ${active.length === 1 ? 'actieve aanmelding' : 'actieve aanmeldingen'}. De export bevat per adres een afmeldlink voor in je mail.`,
      active.length ? '<a class="btn" href="/api/admin/subscribers.csv">Exporteer als CSV</a>' : '',
    ) +
    (subs.length
      ? `<div class="card list">${subs
          .map(
            (s) =>
              `<div class="row no-thumb" data-id="${s.id}"><div class="row-main"><strong>${esc(s.email)}</strong><span class="row-sub">${s.unsubscribed_at ? '<span class="badge muted">Afgemeld</span>' : '<span class="badge ok">Actief</span>'}${s.lang === 'en' ? 'Engels' : 'Nederlands'}, aangemeld op ${fmtDate(s.created_at)}</span></div><div class="row-meta"><button type="button" class="link danger" data-remove>Verwijderen</button></div></div>`,
          )
          .join('')}</div>`
      : emptyState('Nog geen aanmeldingen', 'Bezoekers kunnen zich onderaan elke pagina aanmelden voor de nieuwsbrief.'))
  $$('[data-remove]', el).forEach((b) =>
    b.addEventListener('click', async () => {
      const row = b.closest('[data-id]')
      if (!confirm('Dit adres uit de lijst verwijderen?')) return
      await api(`/subscribers/${row.dataset.id}`, { method: 'DELETE' }).catch((e) => toast(e.message, true))
      viewSubscribers(el)
    }),
  )
}

// ---------- settings ----------
async function viewSettings(el) {
  const s = await api('/settings')
  const a = s.announcement
  const soc = s.socials
  const socField = (k, label) =>
    `<div class="field"><label for="s-${k}">${label}</label><input id="s-${k}" name="${k}" inputmode="url" placeholder="https://" value="${esc(soc[k] || '')}"></div>`
  el.innerHTML = `${pageHead('Instellingen', 'Wat er op alle pagina\'s van de site staat.')}
  <form class="card" data-ann novalidate>
    <h2>Aankondigingsbalk</h2>
    <p class="muted-text" style="margin:6px 0 16px">Een korte melding bovenaan elke pagina, bijvoorbeeld voor een event of een nieuwe release. Bezoekers kunnen hem wegklikken.</p>
    <label class="check"><input type="checkbox" name="enabled" ${a.enabled ? 'checked' : ''}> Tonen op de site</label>
    <div class="row-2" style="margin-top:16px">
      <div class="field"><label for="an-nl">Tekst</label><input id="an-nl" name="text_nl" maxlength="160" value="${esc(a.text_nl)}" placeholder="Bijvoorbeeld: Nieuwe single van KREAM, nu te luisteren"></div>
      <div class="field"><label for="an-en">Tekst in het Engels <span class="opt">optioneel</span></label><input id="an-en" name="text_en" maxlength="160" value="${esc(a.text_en)}"></div>
    </div>
    <div class="field"><label for="an-link">Link <span class="opt">optioneel, bijvoorbeeld /blog of https://open.spotify.com/...</span></label><input id="an-link" name="link" maxlength="300" value="${esc(a.link)}"></div>
    <div class="ann-preview" data-ann-preview></div>
    <div class="stack-btns" style="max-width:240px"><button type="submit" class="btn">Opslaan</button></div>
  </form>
  <form class="card" data-soc novalidate>
    <h2>Social media</h2>
    <p class="muted-text" style="margin:6px 0 16px">Deze links staan in de footer en op de contactpagina. Laat leeg wat je niet gebruikt.</p>
    <div class="row-2">${socField('instagram', 'Instagram')}${socField('spotify', 'Spotify')}</div>
    <div class="row-2">${socField('youtube', 'YouTube')}${socField('tiktok', 'TikTok')}</div>
    ${socField('linkedin', 'LinkedIn')}
    <div class="stack-btns" style="max-width:240px"><button type="submit" class="btn">Opslaan</button></div>
  </form>`
  const ann = $('[data-ann]', el)
  const preview = () => {
    const text = ann.text_nl.value.trim()
    $('[data-ann-preview]', el).textContent = text ? `${text}${ann.link.value.trim() ? '  →' : ''}` : 'Voorbeeld verschijnt hier'
  }
  preview()
  ann.addEventListener('input', () => {
    dirty = true
    preview()
  })
  ann.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      await api('/settings', {
        method: 'PUT',
        body: { announcement: { enabled: ann.enabled.checked, text_nl: ann.text_nl.value.trim(), text_en: ann.text_en.value.trim(), link: ann.link.value.trim() } },
      })
      dirty = false
      toast(ann.enabled.checked ? 'Opgeslagen, de balk staat nu op de site' : 'Opgeslagen')
    } catch (err) {
      toast(err.message, true)
    }
  })
  const soc2 = $('[data-soc]', el)
  soc2.addEventListener('input', () => (dirty = true))
  soc2.addEventListener('submit', async (e) => {
    e.preventDefault()
    const f = soc2.elements
    try {
      await api('/settings', {
        method: 'PUT',
        body: { socials: Object.fromEntries(['instagram', 'spotify', 'youtube', 'tiktok', 'linkedin'].map((k) => [k, f.namedItem(k).value.trim()])) },
      })
      dirty = false
      toast('Opgeslagen')
    } catch (err) {
      toast(err.message, true)
    }
  })
}

// ---------- account ----------
const linkBox = (link, text) =>
  `<div class="linkbox"><p>${text}</p><code>${esc(link)}</code><div><button type="button" class="btn ghost" data-copy="${esc(link)}">Kopieer link</button></div></div>`

async function viewAccount(el) {
  const users = await api('/users')
  el.innerHTML = `${pageHead('Account', `Ingelogd als ${esc(me.user.email)}.`)}
  <div data-install-slot="fixed"></div>
  <section class="grid-2">
    <form class="card" data-pass novalidate>
      <h2>Wachtwoord wijzigen</h2>
      <div class="field" style="margin-top:16px"><label for="pw-cur">Huidig wachtwoord</label><input id="pw-cur" name="current" type="password" autocomplete="current-password"></div>
      <div class="field"><label for="pw-new">Nieuw wachtwoord <span class="opt">minstens 10 tekens</span></label><input id="pw-new" name="next" type="password" autocomplete="new-password"></div>
      <div class="field"><label for="pw-new2">Nieuw wachtwoord, nog een keer</label><input id="pw-new2" name="next2" type="password" autocomplete="new-password"></div>
      <div class="stack-btns"><button type="submit" class="btn">Wachtwoord opslaan</button></div>
    </form>
    <form class="card" data-invite novalidate>
      <h2>Iemand uitnodigen</h2>
      <p class="muted-text" style="margin:6px 0 16px">Maak een account voor een mede-founder. Je krijgt een link die je zelf doorstuurt, bijvoorbeeld via WhatsApp. De link is 7 dagen geldig.</p>
      <div class="field"><label for="in-name">Naam</label><input id="in-name" name="name" maxlength="80"></div>
      <div class="field"><label for="in-email">E-mailadres</label><input id="in-email" name="email" type="email"></div>
      <div class="stack-btns"><button type="submit" class="btn">Uitnodiging maken</button></div>
      <div data-invite-result></div>
    </form>
  </section>
  <section class="card">
    <h2>Team</h2>
    <div class="list" style="margin-top:10px">${users
      .map(
        (u) =>
          `<div class="row no-thumb" data-id="${u.id}"><div class="row-main"><strong>${esc(u.name)}${u.id === me.user.id ? ' (jij)' : ''}</strong><span class="row-sub">${u.active ? '<span class="badge ok">Actief</span>' : '<span class="badge warn">Uitgenodigd</span>'}${esc(u.email)}${u.last_login_at ? `, laatst ingelogd ${fmtDate(u.last_login_at)}` : ''}</span></div>
          <div class="row-meta">${u.id === me.user.id ? '' : `<button type="button" class="link" data-reset>${u.active ? 'Nieuwe wachtwoordlink' : 'Nieuwe uitnodigingslink'}</button> <button type="button" class="link danger" data-del>Verwijderen</button>`}</div></div>`,
      )
      .join('')}</div>
    <div data-team-result></div>
  </section>`

  paintInstall()
  const pass = $('[data-pass]', el)
  pass.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (pass.next.value !== pass.next2.value) return toast('De twee nieuwe wachtwoorden zijn niet hetzelfde.', true)
    try {
      await api('/password', { method: 'PUT', body: { current: pass.current.value, next: pass.next.value } })
      pass.reset()
      toast('Je nieuwe wachtwoord is opgeslagen. Andere apparaten zijn uitgelogd.')
    } catch (err) {
      toast(err.message, true)
    }
  })

  const inv = $('[data-invite]', el)
  inv.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      const r = await api('/users', { method: 'POST', body: { name: inv.name.value.trim(), email: inv.email.value.trim() } })
      $('[data-invite-result]', el).innerHTML = linkBox(
        r.link,
        r.kind === 'setup' ? `Stuur deze link naar ${esc(inv.name.value.trim() || inv.email.value.trim())}. Daarmee kiest diegene een eigen wachtwoord.` : 'Dit account bestond al. Met deze link kiest diegene een nieuw wachtwoord.',
      )
      inv.reset()
    } catch (err) {
      toast(err.message, true)
    }
  })

  $$('[data-reset]', el).forEach((b) =>
    b.addEventListener('click', async () => {
      const id = b.closest('[data-id]').dataset.id
      const u = users.find((x) => String(x.id) === id)
      try {
        const r = await api(`/users/${id}/reset`, { method: 'POST' })
        $('[data-team-result]', el).innerHTML = linkBox(r.link, `Stuur deze link naar ${esc(u.name)}. Hij is 2 dagen geldig.`)
      } catch (err) {
        toast(err.message, true)
      }
    }),
  )
  $$('[data-del]', el).forEach((b) =>
    b.addEventListener('click', async () => {
      const id = b.closest('[data-id]').dataset.id
      const u = users.find((x) => String(x.id) === id)
      if (!confirm(`Het account van ${u.name} verwijderen? Diegene kan dan niet meer inloggen.`)) return
      try {
        await api(`/users/${id}`, { method: 'DELETE' })
        toast('Account verwijderd')
        viewAccount(el)
      } catch (err) {
        toast(err.message, true)
      }
    }),
  )
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/dashboard/sw.js', { scope: '/dashboard/' }).catch(() => {})

boot()
