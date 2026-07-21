import { createHash } from 'node:crypto'

export type DigestMode = 'off' | 'daily' | 'weekly'
export type DigestPolicy = { tenantId: string; mode: DigestMode; hourUtc: number }
export type DigestRecipient = { userId: string; email: string; total: number }
export type DigestItem = { userId: string; title: string; linkPath?: string | null }
export type DigestMessage = { to: string; subject: string; html: string; text: string; idempotencyKey: string; tenantId: string; userId: string }

export type NotificationDigestStore = {
  policies(): Promise<readonly DigestPolicy[]>
  recipients(input: { tenantId: string; start: Date; end: Date; afterUserId?: string; limit: number }): Promise<readonly DigestRecipient[]>
  items(input: { tenantId: string; userIds: string[]; start: Date; end: Date; limitPerUser: number }): Promise<readonly DigestItem[]>
}

const RECIPIENT_PAGE_SIZE = 200
const MAX_ITEMS_PER_DIGEST = 50

/** Scan due tenant policies and emit one bounded, idempotent message per user. */
export async function scanNotificationDigests(input: {
  store: NotificationDigestStore
  deliver: (message: DigestMessage) => Promise<void>
  applicationUrl: string
  scheduledFor?: Date
}): Promise<{ tenants: number; messages: number }> {
  const now = input.scheduledFor ?? new Date()
  const result = { tenants: 0, messages: 0 }
  for (const policy of await input.store.policies()) {
    if (policy.mode === 'off' || policy.hourUtc !== now.getUTCHours()) continue
    if (policy.mode === 'weekly' && now.getUTCDay() !== 1) continue
    result.tenants += 1
    const start = new Date(now.getTime() - (policy.mode === 'weekly' ? 168 : 24) * 60 * 60 * 1_000)
    let afterUserId: string | undefined
    while (true) {
      const recipients = await input.store.recipients({ tenantId: policy.tenantId, start, end: now, afterUserId, limit: RECIPIENT_PAGE_SIZE })
      if (!recipients.length) break
      const items = await input.store.items({ tenantId: policy.tenantId, userIds: recipients.map((recipient) => recipient.userId), start, end: now, limitPerUser: MAX_ITEMS_PER_DIGEST })
      const byUser = new Map<string, DigestItem[]>()
      for (const item of items) byUser.set(item.userId, [...(byUser.get(item.userId) ?? []), item])
      for (const recipient of recipients) {
        const userItems = byUser.get(recipient.userId) ?? []
        if (!userItems.length) continue
        const omitted = recipient.total - userItems.length
        const period = `${policy.mode}|${now.toISOString().slice(0, 13)}`
        const idempotencyKey = `notification-digest|${createHash('sha256').update(`${policy.tenantId}\0${recipient.email.toLowerCase()}\0${period}`).digest('hex')}`
        const list = userItems.map((item) => `<li>${escapeHtml(item.title)}${item.linkPath ? ` — <a href="${escapeHtml(new URL(item.linkPath, input.applicationUrl).href)}">open</a>` : ''}</li>`).join('')
        const extraHtml = omitted > 0 ? `<p>Showing the newest ${userItems.length} updates.</p>` : ''
        const extraText = omitted > 0 ? `\nShowing the newest ${userItems.length} updates.` : ''
        await input.deliver({
          to: recipient.email,
          subject: `Your ${policy.mode} summary — ${recipient.total} update${recipient.total === 1 ? '' : 's'}`,
          html: `<p>${recipient.total} unread notification${recipient.total === 1 ? '' : 's'}:</p>${extraHtml}<ul>${list}</ul>`,
          text: `${userItems.map((item) => `• ${item.title}`).join('\n')}${extraText}`,
          idempotencyKey,
          tenantId: policy.tenantId,
          userId: recipient.userId,
        })
        result.messages += 1
      }
      afterUserId = recipients.at(-1)!.userId
      if (recipients.length < RECIPIENT_PAGE_SIZE) break
    }
  }
  return result
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!)
}
