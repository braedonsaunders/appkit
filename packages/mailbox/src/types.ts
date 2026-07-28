/**
 * The mail engine is persistence-injected: it speaks IMAP/SMTP and RFC 5322,
 * the application owns the ledger. Config carries the unsealed credential for
 * the duration of one operation only — never store it.
 *
 * Two credential shapes, one connection type. A password authenticates with
 * LOGIN/PLAIN; an `accessToken` authenticates with XOAUTH2, which is what
 * Google Workspace and Microsoft 365 require (Microsoft has retired basic
 * auth for IMAP/SMTP entirely). Access tokens are minted per operation from a
 * refresh token the application holds — this type never sees the long-lived
 * credential.
 */
export type MailboxConnection = {
  address: string
  imap: { host: string; port: number; secure: boolean }
  smtp: { host: string; port: number; secure: boolean }
  username: string
  /** LOGIN/PLAIN password. Ignored (and may be '') when `accessToken` is set. */
  password: string
  /** Short-lived OAuth 2.0 access token. When set, both endpoints use XOAUTH2. */
  accessToken?: string
}

export type MailAddress = { name?: string; address: string }

export type InboundMessage = {
  /** RFC 5322 Message-ID (angle brackets stripped). */
  messageId: string
  /** Thread key: the root of the References chain, else this message's id. */
  threadKey: string
  inReplyTo: string | null
  from: MailAddress
  to: MailAddress[]
  cc: MailAddress[]
  subject: string
  text: string
  html: string | null
  sentAt: Date
  /** IMAP UID, for cursor advancement. */
  uid: number
  attachments: { filename: string; contentType: string; size: number; content: Buffer }[]
}

/** Incremental sync position for one IMAP mailbox. */
export type ImapCursor = {
  uidValidity: string
  lastUid: number
}

export type MailboxStore = {
  getCursor: () => Promise<ImapCursor | null>
  saveCursor: (cursor: ImapCursor) => Promise<void>
  /** Return true if the message id is already in the ledger (dedupe). */
  hasMessage: (messageId: string) => Promise<boolean>
  /** Persist one inbound message (thread upsert included application-side). */
  saveInbound: (message: InboundMessage) => Promise<void>
}

export type OutboundAttachment = {
  filename: string
  content: Buffer | Uint8Array
  contentType?: string
  /** Content-ID for inline references from the HTML body (`cid:` URLs). */
  contentId?: string
}

export type SendMailArgs = {
  to: MailAddress[]
  cc?: MailAddress[]
  subject: string
  text: string
  html?: string
  /** Reply threading: the Message-ID being answered and the full chain. */
  inReplyTo?: string
  references?: string[]
  fromName?: string
  attachments?: OutboundAttachment[]
}

export type SendMailResult = {
  messageId: string
  sentAt: Date
}

export type SyncResult = {
  fetched: number
  saved: number
  cursor: ImapCursor
}
