// node server/cli.js invite <email> <name...>   one-time link to set a password
// node server/cli.js reset <email>              one-time link to choose a new password
// node server/cli.js users                      list accounts
import { db } from './db.js'
import { inviteUser, createLinkToken } from './auth.js'

const BASE = (process.env.PUBLIC_URL || 'http://localhost:5460').replace(/\/$/, '')
const [cmd, email, ...rest] = process.argv.slice(2)

if (cmd === 'invite' && email) {
  const { user, kind, token } = inviteUser(email, rest.join(' ') || email)
  console.log(`${kind === 'setup' ? 'Setup' : 'Reset'} link for ${user.email}:\n${BASE}/dashboard/?token=${token}`)
} else if (cmd === 'reset' && email) {
  const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email.toLowerCase())
  if (!user) {
    console.error('No such user')
    process.exit(1)
  }
  console.log(`Reset link for ${user.email}:\n${BASE}/dashboard/?token=${createLinkToken(user.id, 'reset', 2 * 86_400_000)}`)
} else if (cmd === 'users') {
  for (const u of db.prepare('SELECT email, name, password_hash IS NOT NULL AS active, last_login_at FROM users').all()) {
    console.log(`${u.email}\t${u.name}\t${u.active ? 'active' : 'invited'}\t${u.last_login_at ? new Date(u.last_login_at).toISOString() : '-'}`)
  }
} else {
  console.log('Usage: node server/cli.js invite <email> <name> | reset <email> | users')
  process.exit(1)
}
