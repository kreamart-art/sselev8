import crypto from 'node:crypto'

// Google Analytics Data API through a service account (read-only). Configured with
// GA_PROPERTY_ID plus GA_SERVICE_ACCOUNT_JSON (raw JSON or base64 of it).
const PROPERTY = process.env.GA_PROPERTY_ID || ''

function loadCredentials() {
  const raw = process.env.GA_SERVICE_ACCOUNT_JSON || ''
  if (!raw) return null
  try {
    return JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'))
  } catch {
    console.error('[ga] GA_SERVICE_ACCOUNT_JSON is not valid JSON')
    return null
  }
}
const creds = loadCredentials()

export const gaConfigured = () => Boolean(PROPERTY && creds?.client_email && creds?.private_key)

let token = null
async function accessToken() {
  if (token && token.exp > Date.now() + 60_000) return token.value
  const iat = Math.floor(Date.now() / 1000)
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + 3600,
  })}`
  const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), creds.private_key).toString('base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || data.error || 'token request failed')
  token = { value: data.access_token, exp: Date.now() + data.expires_in * 1000 }
  return token.value
}

async function report(body) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'report failed')
  return (data.rows || []).map((r) => ({
    dims: (r.dimensionValues || []).map((d) => d.value),
    vals: (r.metricValues || []).map((m) => Number(m.value)),
  }))
}

const cache = new Map()
export async function gaSummary(days) {
  const key = String(days)
  const hit = cache.get(key)
  if (hit && hit.at > Date.now() - 10 * 60_000) return hit.data
  const dateRanges = [{ startDate: `${days - 1}daysAgo`, endDate: 'today' }]
  const top = (dimension, metric, limit = 8) =>
    report({ dateRanges, dimensions: [{ name: dimension }], metrics: [{ name: metric }], orderBys: [{ metric: { metricName: metric }, desc: true }], limit })
  const [totals, daily, sources, devices, pages, countries] = await Promise.all([
    report({ dateRanges, metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }, { name: 'averageSessionDuration' }] }),
    report({ dateRanges, dimensions: [{ name: 'date' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ dimension: { dimensionName: 'date' } }] }),
    top('sessionDefaultChannelGroup', 'sessions'),
    top('deviceCategory', 'activeUsers', 5),
    top('pagePath', 'screenPageViews'),
    top('country', 'activeUsers', 6),
  ])
  const t = totals[0]?.vals || [0, 0, 0, 0]
  const data = {
    totals: { users: t[0], sessions: t[1], views: t[2], avgSeconds: Math.round(t[3]) },
    daily: daily.map((r) => ({ day: `${r.dims[0].slice(0, 4)}-${r.dims[0].slice(4, 6)}-${r.dims[0].slice(6, 8)}`, value: r.vals[0] })),
    sources: sources.map((r) => ({ label: r.dims[0], value: r.vals[0] })),
    devices: devices.map((r) => ({ label: r.dims[0], value: r.vals[0] })),
    pages: pages.map((r) => ({ label: r.dims[0], value: r.vals[0] })),
    countries: countries.map((r) => ({ label: r.dims[0], value: r.vals[0] })),
  }
  cache.set(key, { at: Date.now(), data })
  return data
}
