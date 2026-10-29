import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { createAppkitAuth } from './server'

// A dedicated disposable database is supplied by hosted CI; never use a production URL.
test('persisted MFA, recovery and revocation across the canonical migration', { skip: !process.env.APPKIT_TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.APPKIT_TEST_DATABASE_URL })
  try {
    for (const name of ['0000_initial', '0001_kind_beast', '0002_outgoing_susan_delgado']) {
      await pool.query(await readFile(new URL(`../../db/drizzle/${name}.sql`, import.meta.url), 'utf8'))
    }
    const userId = '50000000-0000-4000-8000-000000000001'
    await pool.query('INSERT INTO users (id,email,name) VALUES ($1,$2,$3)', [userId, 'admin@example.test', 'Admin'])
    await pool.query(await readFile(new URL('../../db/drizzle/0003_account_security.sql', import.meta.url), 'utf8'))
    assert.equal((await pool.query('SELECT two_factor_enabled FROM users WHERE id=$1', [userId])).rows[0].two_factor_enabled, false)
    const mails: Array<{ text: string; html: string }> = []
    const auth = createAppkitAuth({ database: pool, baseURL: 'https://account.example.test', secret: 'integration-test-secret-with-at-least-32-characters', appName: 'Test', twoFactor: {}, session: { cookieCacheEnabled: false }, sendEmail: async message => { mails.push(message) } })
    const context = await auth.$context
    await context.internalAdapter.linkAccount({ userId, accountId: userId, providerId: 'credential', password: await context.password.hash('initial password') })
    const jar = new Map<string, string>()
    const cookie = () => [...jar].map(([key, value]) => `${key}=${value}`).join('; ')
    async function request(path: string, body?: unknown, cookieOverride?: string) {
      const response = await auth.handler(new Request(`https://account.example.test/api/auth/${path}`, {
        method: body === undefined ? 'GET' : 'POST', headers: { origin: 'https://account.example.test', 'content-type': 'application/json', cookie: cookieOverride ?? cookie() },
        body: body === undefined ? undefined : JSON.stringify(body),
      }))
      if (cookieOverride === undefined) for (const header of response.headers.getSetCookie()) {
        const pair = header.split(';')[0]!
        const at = pair.indexOf('=')
        jar.set(pair.slice(0, at), pair.slice(at + 1))
      }
      return response
    }
    assert.equal((await request('sign-in/email', { email: 'admin@example.test', password: 'initial password' })).status, 200)
    const beforeEnrollment = cookie()
    const enabled = await request('two-factor/enable', { password: 'initial password' })
    assert.equal(enabled.status, 200)
    const enrollment = await enabled.json() as { totpURI: string; backupCodes: string[] }
    const secret = new URL(enrollment.totpURI).searchParams.get('secret')!
    const code = await auth.api.generateTOTP({ body: { secret } })
    assert.equal((await request('two-factor/verify-totp', code)).status, 200)
    const stored = (await pool.query('SELECT secret,backup_codes FROM two_factors WHERE user_id=$1', [userId])).rows[0]
    assert.notEqual(stored.secret, secret)
    assert.equal(stored.backup_codes.includes(enrollment.backupCodes[0]), false)
    await request('sign-out', {})
    const challenge = await request('sign-in/email', { email: 'admin@example.test', password: 'initial password' })
    assert.equal((await challenge.json()).twoFactorRedirect, true)
    assert.equal(await (await request('get-session')).json(), null)
    assert.equal((await request('two-factor/verify-totp', { code: 'invalid' })).ok, false)
    assert.equal(await (await request('get-session')).json(), null)
    assert.equal((await request('two-factor/verify-backup-code', { code: enrollment.backupCodes[0] })).status, 200)
    const recoverySession = cookie()
    assert.ok(await (await request('get-session')).json())
    await request('sign-out', {})
    await request('sign-in/email', { email: 'admin@example.test', password: 'initial password' })
    assert.equal((await request('two-factor/verify-backup-code', { code: enrollment.backupCodes[0] })).ok, false)
    assert.equal((await request('two-factor/verify-backup-code', { code: enrollment.backupCodes[1] })).status, 200)
    const resetSession = cookie()
    const unknown = await request('request-password-reset', { email: 'missing@example.test', redirectTo: 'https://account.example.test/recover' })
    const known = await request('request-password-reset', { email: 'admin@example.test', redirectTo: 'https://account.example.test/recover' })
    assert.deepEqual(await known.json(), await unknown.json())
    assert.equal(mails.length, 1)
    const resetToken = /reset-password\/([^?\s"<]+)/.exec(mails[0]!.text || mails[0]!.html)![1]!
    assert.equal((await request('reset-password', { token: resetToken, newPassword: 'replacement password' })).status, 200)
    for (const oldCookie of [beforeEnrollment, recoverySession, resetSession]) assert.equal(await (await request('get-session', undefined, oldCookie)).json(), null)
    assert.equal((await request('reset-password', { token: resetToken, newPassword: 'another password' })).ok, false)
    assert.equal((await (await request('sign-in/email', { email: 'admin@example.test', password: 'replacement password' })).json()).twoFactorRedirect, true)
    assert.equal((await request('two-factor/verify-backup-code', { code: enrollment.backupCodes[2] })).status, 200)
    const session = await (await request('get-session')).json()
    const revokedCookie = cookie()
    assert.equal((await request('revoke-session', { token: session.session.token })).status, 200)
    assert.equal(await (await request('get-session', undefined, revokedCookie)).json(), null)
  } finally { await pool.end() }
})
