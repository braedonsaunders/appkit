export { syncMailbox, verifyImap } from './sync'
export { sendMail, verifySmtp } from './send'
export type {
  ImapCursor,
  InboundMessage,
  MailAddress,
  MailboxConnection,
  MailboxStore,
  OutboundAttachment,
  SendMailArgs,
  SendMailResult,
  SyncResult,
} from './types'
