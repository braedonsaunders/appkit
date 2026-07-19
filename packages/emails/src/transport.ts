import nodemailer from 'nodemailer'

/**
 * Email delivery. A `Transport` sends a message; the app resolves which
 * transport to use (per-tenant or platform). Two are built in — SMTP
 * (nodemailer) and a console transport for dev. Provider-API transports
 * (Resend / SendGrid / …) implement the same interface. See ./providers for the
 * settings catalogue.
 */

export type EmailAddress = string | { name?: string; email: string }

export type EmailMessage = {
  from: EmailAddress
  to: EmailAddress | EmailAddress[]
  subject: string
  html?: string
  text?: string
  replyTo?: EmailAddress
  cc?: EmailAddress | EmailAddress[]
  bcc?: EmailAddress | EmailAddress[]
}

export type SendResult = { id?: string }

export interface Transport {
  send(message: EmailMessage): Promise<SendResult>
}

function fmt(a: EmailAddress): string {
  return typeof a === 'string' ? a : a.name ? `${a.name} <${a.email}>` : a.email
}
function fmtList(a: EmailAddress | EmailAddress[] | undefined): string | undefined {
  if (!a) return undefined
  return (Array.isArray(a) ? a : [a]).map(fmt).join(', ')
}

export type SmtpConfig = {
  host: string
  port?: number
  /** Implicit TLS (port 465). Omit to infer from the port. */
  secure?: boolean
  auth?: { user: string; pass: string }
}

/** SMTP transport (works with any SMTP provider, or Mailpit in dev). */
export function smtpTransport(config: SmtpConfig): Transport {
  const port = config.port ?? (config.secure ? 465 : 587)
  const transporter = nodemailer.createTransport({
    host: config.host,
    port,
    secure: config.secure ?? port === 465,
    auth: config.auth,
  })
  return {
    async send(message) {
      const info = await transporter.sendMail({
        from: fmt(message.from),
        to: fmtList(message.to),
        cc: fmtList(message.cc),
        bcc: fmtList(message.bcc),
        replyTo: message.replyTo ? fmt(message.replyTo) : undefined,
        subject: message.subject,
        html: message.html,
        text: message.text,
      })
      return { id: info.messageId }
    },
  }
}

/** Dev transport — logs the message instead of sending. */
export function consoleTransport(
  log: (msg: string) => void = (m) => console.log(m),
): Transport {
  return {
    async send(message) {
      log(`[email] to=${fmtList(message.to)} subject=${JSON.stringify(message.subject)}`)
      return { id: `console-${Date.now()}` }
    },
  }
}
