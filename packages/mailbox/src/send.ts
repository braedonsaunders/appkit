import nodemailer from 'nodemailer'
import type { MailboxConnection, SendMailArgs, SendMailResult } from './types'

function bracket(id: string): string {
  return id.startsWith('<') ? id : `<${id}>`
}

/**
 * XOAUTH2 when the caller minted an access token, LOGIN/PLAIN otherwise.
 * Nodemailer sends the token as-is — refreshing it is the caller's job, so
 * no clientId/clientSecret ever reaches the transport.
 */
function smtpAuth(
  conn: MailboxConnection,
): { user: string; pass: string } | { type: 'OAuth2'; user: string; accessToken: string } {
  return conn.accessToken
    ? { type: 'OAuth2', user: conn.username, accessToken: conn.accessToken }
    : { user: conn.username, pass: conn.password }
}

/**
 * Send one message over the mailbox's SMTP endpoint. Reply threading is the
 * caller's contract: pass the answered Message-ID and the full chain so every
 * client threads the conversation correctly.
 */
export async function sendMail(conn: MailboxConnection, args: SendMailArgs): Promise<SendMailResult> {
  const transport = nodemailer.createTransport({
    host: conn.smtp.host,
    port: conn.smtp.port,
    secure: conn.smtp.secure,
    auth: smtpAuth(conn),
  })
  try {
    const info = await transport.sendMail({
      from: args.fromName ? { name: args.fromName, address: conn.address } : conn.address,
      to: args.to.map((a) => (a.name ? { name: a.name, address: a.address } : a.address)),
      cc: args.cc?.map((a) => (a.name ? { name: a.name, address: a.address } : a.address)),
      subject: args.subject,
      text: args.text,
      html: args.html,
      inReplyTo: args.inReplyTo ? bracket(args.inReplyTo) : undefined,
      references: args.references?.length ? args.references.map(bracket).join(' ') : undefined,
      attachments: args.attachments?.length
        ? args.attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content),
            contentType: a.contentType,
            cid: a.contentId,
          }))
        : undefined,
    })
    return {
      messageId: info.messageId.replace(/^<|>$/g, ''),
      sentAt: new Date(),
    }
  } finally {
    transport.close()
  }
}

/** Connectivity check for the connect flow: does SMTP accept our login? */
export async function verifySmtp(conn: MailboxConnection): Promise<void> {
  const transport = nodemailer.createTransport({
    host: conn.smtp.host,
    port: conn.smtp.port,
    secure: conn.smtp.secure,
    auth: smtpAuth(conn),
  })
  try {
    await transport.verify()
  } finally {
    transport.close()
  }
}
