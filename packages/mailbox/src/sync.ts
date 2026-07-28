import { ImapFlow } from 'imapflow'
import { simpleParser, type AddressObject } from 'mailparser'
import type { ImapCursor, InboundMessage, MailAddress, MailboxConnection, MailboxStore, SyncResult } from './types'

function stripAngles(id: string | undefined | null): string | null {
  if (!id) return null
  const trimmed = id.trim()
  return trimmed.replace(/^<|>$/g, '') || null
}

function toAddresses(value: AddressObject | AddressObject[] | undefined): MailAddress[] {
  const objects = Array.isArray(value) ? value : value ? [value] : []
  return objects.flatMap((o) =>
    o.value
      .filter((v) => v.address)
      .map((v) => ({ address: v.address!, ...(v.name ? { name: v.name } : {}) })),
  )
}

/**
 * One incremental IMAP sync pass over INBOX. UIDVALIDITY change resets the
 * cursor (server renumbered the mailbox); otherwise only UIDs above the last
 * seen are fetched. Dedupe is by Message-ID via the store, so overlapping
 * passes are idempotent.
 */
export async function syncMailbox(conn: MailboxConnection, store: MailboxStore): Promise<SyncResult> {
  const client = new ImapFlow({
    host: conn.imap.host,
    port: conn.imap.port,
    secure: conn.imap.secure,
    auth: { user: conn.username, pass: conn.password },
    logger: false,
  })
  await client.connect()
  try {
    const lock = await client.getMailboxLock('INBOX')
    try {
      const mailbox = client.mailbox
      if (!mailbox || typeof mailbox === 'boolean') throw new Error('INBOX could not be opened')
      const uidValidity = String(mailbox.uidValidity ?? '0')
      const prior = await store.getCursor()
      const fromUid = prior && prior.uidValidity === uidValidity ? prior.lastUid + 1 : 1

      let fetched = 0
      let saved = 0
      let lastUid = prior && prior.uidValidity === uidValidity ? prior.lastUid : 0

      for await (const item of client.fetch(`${fromUid}:*`, { uid: true, source: true }, { uid: true })) {
        if (item.uid < fromUid) continue
        fetched += 1
        lastUid = Math.max(lastUid, item.uid)
        if (!item.source) continue
        const parsed = await simpleParser(item.source)
        const messageId = stripAngles(parsed.messageId) ?? `uid-${uidValidity}-${item.uid}@${conn.imap.host}`
        if (await store.hasMessage(messageId)) continue
        const references = (Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [])
          .map((r) => stripAngles(r))
          .filter((r): r is string => r !== null)
        const from = toAddresses(parsed.from)[0] ?? { address: 'unknown@invalid' }
        const message: InboundMessage = {
          messageId,
          threadKey: references[0] ?? messageId,
          inReplyTo: stripAngles(parsed.inReplyTo),
          from,
          to: toAddresses(parsed.to),
          cc: toAddresses(parsed.cc),
          subject: parsed.subject ?? '(no subject)',
          text: parsed.text ?? '',
          html: typeof parsed.html === 'string' ? parsed.html : null,
          sentAt: parsed.date ?? new Date(),
          uid: item.uid,
          attachments: parsed.attachments.map((a) => ({
            filename: a.filename ?? 'attachment',
            contentType: a.contentType,
            size: a.size,
            content: a.content,
          })),
        }
        await store.saveInbound(message)
        saved += 1
      }

      const cursor: ImapCursor = { uidValidity, lastUid }
      await store.saveCursor(cursor)
      return { fetched, saved, cursor }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => client.close())
  }
}

/** Cheap connectivity check used by the connect flow: can we authenticate? */
export async function verifyImap(conn: MailboxConnection): Promise<void> {
  const client = new ImapFlow({
    host: conn.imap.host,
    port: conn.imap.port,
    secure: conn.imap.secure,
    auth: { user: conn.username, pass: conn.password },
    logger: false,
  })
  await client.connect()
  await client.logout().catch(() => client.close())
}
