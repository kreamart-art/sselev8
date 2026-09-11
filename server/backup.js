import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { db, BACKUP_DIR } from './db.js'

const KEEP = Number(process.env.ELEV8_BACKUP_KEEP) || 14

const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)

// VACUUM INTO writes a consistent, standalone copy even while WAL is active.
export function runBackup() {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })
  const file = path.join(BACKUP_DIR, `elev8-${stamp()}.db`)
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
  const all = readdirSync(BACKUP_DIR)
    .filter((n) => n.startsWith('elev8-') && n.endsWith('.db'))
    .map((name) => ({ name, at: statSync(path.join(BACKUP_DIR, name)).mtimeMs }))
    .sort((a, b) => b.at - a.at)
  for (const f of all.slice(KEEP)) {
    try {
      unlinkSync(path.join(BACKUP_DIR, f.name))
    } catch {
      /* ignore */
    }
  }
  return file
}

export function scheduleBackups(intervalMs = 24 * 60 * 60 * 1000) {
  const run = () => {
    try {
      console.log('[backup]', path.basename(runBackup()))
    } catch (e) {
      console.error('[backup] failed:', e.message)
    }
  }
  setTimeout(run, 30_000).unref()
  setInterval(run, intervalMs).unref()
}
