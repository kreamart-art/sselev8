import nodemailer from 'nodemailer'
import { getSetting, setSetting } from './db.js'

// Replies and alerts go out through the company's own mailbox (STRATO), so recipients see
// info@elev8entertainment.nl and their answers land in that inbox. The founders enter the
// mailbox password in the dashboard; SMTP_PASS (plus SMTP_HOST/PORT/USER) in the environment
// overrides that. The password is never sent back to the browser.
const DEFAULTS = { host: 'smtp.strato.de', port: 465, user: 'info@elev8entertainment.nl', pass: '', notify: true, verifiedAt: null }
const FROM_NAME = 'S&S ELEV8 Entertainment'

export const fromEnv = () => Boolean(process.env.SMTP_PASS)

export function mailConfig() {
  const stored = getSetting('mail', DEFAULTS)
  if (!fromEnv()) return stored
  return {
    host: process.env.SMTP_HOST || DEFAULTS.host,
    port: Number(process.env.SMTP_PORT) || DEFAULTS.port,
    user: process.env.SMTP_USER || DEFAULTS.user,
    pass: process.env.SMTP_PASS,
    notify: stored.notify !== false,
    verifiedAt: stored.verifiedAt,
  }
}

export const mailReady = (c = mailConfig()) => Boolean(c.host && c.user && c.pass)

export function mailStatus() {
  const c = mailConfig()
  return {
    configured: mailReady(c),
    host: c.host,
    port: c.port,
    user: c.user,
    notify: c.notify !== false,
    hasPassword: Boolean(c.pass),
    fromEnv: fromEnv(),
    verifiedAt: c.verifiedAt || null,
  }
}

export const saveMailConfig = (c) => setSetting('mail', c)

const transport = (c) =>
  nodemailer.createTransport({
    host: c.host,
    port: Number(c.port),
    secure: Number(c.port) === 465,
    auth: { user: c.user, pass: c.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })

// Logs in without sending anything, so a wrong password is caught when it is entered.
export const verify = (c) => transport(c).verify()

export function send({ to, subject, text, replyTo, bcc }, c = mailConfig()) {
  if (!mailReady(c)) return Promise.reject(Object.assign(new Error('Mail is not configured'), { code: 'ENOCONFIG' }))
  return transport(c).sendMail({ from: { name: FROM_NAME, address: c.user }, to, subject, text, replyTo: replyTo || c.user, bcc })
}

// Dutch messages for the dashboard; nodemailer's own errors are technical English.
export function mailError(e) {
  if (e?.code === 'ENOCONFIG') return 'Verbind eerst jullie mailbox bij Instellingen.'
  if (e?.code === 'EAUTH' || e?.responseCode === 535) return 'Inloggen bij de mailserver lukt niet. Controleer het mailadres en het wachtwoord.'
  if (['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EDNS', 'ECONNREFUSED'].includes(e?.code)) {
    return 'De mailserver is niet bereikbaar. Controleer de serverinstellingen of probeer het zo opnieuw.'
  }
  if (e?.code === 'EENVELOPE' || e?.responseCode === 550) return 'De mailserver weigerde het adres van de ontvanger.'
  return 'Versturen is mislukt. Probeer het zo opnieuw.'
}
