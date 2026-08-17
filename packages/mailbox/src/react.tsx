'use client'

/**
 * MailboxInbox — the operator surface for the mail engine.
 *
 * The engine in `./index` speaks IMAP/SMTP and owns no state; this component
 * owns no data. Everything it renders arrives as props and every mutation
 * leaves through a callback, so the application keeps the ledger, the folder
 * counts, and the send/reply transport. Only the reply and compose drafts
 * (with their busy/error state) live here, because a draft has no meaning
 * outside the pane that is typing it.
 *
 * The three-pane layout, folder rail, row anatomy, reading pane, empty states,
 * and skeleton follow `@braedonsaunders/appkit-notifications`' `NotificationInbox` so a mail
 * screen and a notification screen read as the same product.
 */

import * as React from 'react'
import {
  ArrowRight,
  ChevronLeft,
  Download,
  Inbox,
  Loader2,
  Mail,
  Mails,
  Menu,
  Paperclip,
  RotateCw,
  Send,
  SquarePen,
  TriangleAlert,
  X,
} from 'lucide-react'
import { Badge, Button, Drawer, Input, Select, Skeleton, Textarea, cn } from '@braedonsaunders/appkit-ui'

export type MailboxOption = {
  id: string
  ownerName: string
  address: string
}

export type MailFolderKey = 'inbox' | 'sent' | 'all'

export type MailThreadListItem = {
  id: string
  /** The other side of the conversation — one name, or a joined list. */
  counterparty: string
  subject: string
  /** ISO 8601 timestamp of the most recent message in the thread. */
  at: string
  /** The thread is still awaiting a resolution. */
  open: boolean
  unread?: boolean
}

export type MailAttachmentView = {
  filename: string
  /** Pre-formatted by the application ("184 KB") — this component never guesses units. */
  sizeLabel: string
  href: string
}

export type MailMessageView = {
  id: string
  direction: 'inbound' | 'outbound'
  fromLabel: string
  toLabel: string
  /** ISO 8601 timestamp. */
  at: string
  bodyText: string
  attachments: MailAttachmentView[]
}

export type MailboxInboxCopy = {
  title: string
  mailbox: string
  searchMailboxes: string
  folders: string
  inbox: string
  sent: string
  all: string
  refresh: string
  newMessage: string
  back: string
  cancel: string
  open: string
  unread: string
  conversation: string
  conversations: string
  messageNoun: string
  messagesNoun: string
  emptyList: string
  emptyListDescription: string
  emptyPane: string
  emptyPaneDescription: string
  noBody: string
  attachments: string
  download: string
  reply: string
  replyPlaceholder: string
  send: string
  sending: string
  to: string
  toPlaceholder: string
  subject: string
  subjectPlaceholder: string
  message: string
  messagePlaceholder: string
}

const DEFAULT_COPY: MailboxInboxCopy = {
  title: 'Mail',
  mailbox: 'Mailbox',
  searchMailboxes: 'Search mailboxes',
  folders: 'Folders',
  inbox: 'Inbox',
  sent: 'Sent',
  all: 'All mail',
  refresh: 'Refresh',
  newMessage: 'New message',
  back: 'Back to conversations',
  cancel: 'Cancel',
  open: 'Open thread',
  unread: 'unread',
  conversation: 'conversation',
  conversations: 'conversations',
  messageNoun: 'message',
  messagesNoun: 'messages',
  emptyList: 'No conversations',
  emptyListDescription: 'Messages in this folder will appear here.',
  emptyPane: 'Select a conversation',
  emptyPaneDescription: 'Choose a conversation from the list to read it here.',
  noBody: 'This message has no text body.',
  attachments: 'Attachments',
  download: 'Download',
  reply: 'Reply',
  replyPlaceholder: 'Write a reply…',
  send: 'Send',
  sending: 'Sending…',
  to: 'To',
  toPlaceholder: 'name@example.com',
  subject: 'Subject',
  subjectPlaceholder: 'What is this about?',
  message: 'Message',
  messagePlaceholder: 'Write your message…',
}

const FOLDER_ORDER: MailFolderKey[] = ['inbox', 'sent', 'all']

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState(true)
  React.useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const sync = () => setIsDesktop(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])
  return isDesktop
}

function relativeTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function initials(name: string): string {
  const parts = name
    .replace(/<[^>]*>/g, ' ')
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  const first = parts[0]
  if (!first) return '?'
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined
  const letters = `${first[0] ?? ''}${last?.[0] ?? ''}`
  return letters.toUpperCase() || '?'
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message) return cause.message
  if (typeof cause === 'string' && cause) return cause
  return 'The message could not be sent.'
}

function CountPill({ value, active }: { value: number; active?: boolean }) {
  if (value <= 0) return null
  return (
    <span
      className={cn(
        'ml-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
        active ? 'bg-primary text-primary-fg' : 'bg-bg-subtle text-fg-muted',
      )}
    >
      {value > 99 ? '99+' : value}
    </span>
  )
}

function FolderButton({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
        active
          ? 'bg-primary-subtle font-medium text-fg'
          : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
      )}
    >
      <span className={cn('shrink-0', active ? 'text-primary' : 'text-fg-subtle')}>{icon}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <CountPill value={count} active={active} />
    </button>
  )
}

function FolderIcon({ folder }: { folder: MailFolderKey }) {
  if (folder === 'inbox') return <Inbox size={16} />
  if (folder === 'sent') return <Send size={16} />
  return <Mails size={16} />
}

function MailboxSwitcher({
  mailboxes,
  activeMailboxId,
  onSwitchMailbox,
  copy,
  className,
}: {
  mailboxes: MailboxOption[]
  activeMailboxId: string
  onSwitchMailbox: (id: string) => void
  copy: MailboxInboxCopy
  className?: string
}) {
  return (
    <div className={cn('shrink-0 space-y-1.5', className)}>
      <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
        {copy.mailbox}
      </p>
      <Select
        value={activeMailboxId}
        onChange={(event) => onSwitchMailbox(event.currentTarget.value)}
        aria-label={copy.mailbox}
        sheetTitle={copy.mailbox}
        searchPlaceholder={copy.searchMailboxes}
        triggerClassName="h-9 text-sm"
      >
        {mailboxes.map((mailbox) => (
          <option key={mailbox.id} value={mailbox.id}>
            {`${mailbox.ownerName} · ${mailbox.address}`}
          </option>
        ))}
      </Select>
    </div>
  )
}

function FolderRail({
  mailboxes,
  activeMailboxId,
  onSwitchMailbox,
  folder,
  folderCounts,
  onSwitchFolder,
  copy,
  variant,
  className,
}: {
  mailboxes: MailboxOption[]
  activeMailboxId: string
  onSwitchMailbox?: ((id: string) => void) | undefined
  folder: MailFolderKey
  folderCounts: Partial<Record<MailFolderKey, number>> | undefined
  onSwitchFolder: (key: MailFolderKey) => void
  copy: MailboxInboxCopy
  variant: 'rail' | 'flyout'
  className?: string
}) {
  const nav = (
    <div className="space-y-0.5">
      {FOLDER_ORDER.map((key) => (
        <FolderButton
          key={key}
          icon={<FolderIcon folder={key} />}
          label={copy[key]}
          count={folderCounts?.[key] ?? 0}
          active={folder === key}
          onClick={() => onSwitchFolder(key)}
        />
      ))}
    </div>
  )

  // A control that changes nothing is worse than no control: on a surface that
  // is one mailbox — an inbox opened on the person it belongs to — a picker
  // offering that same mailbox reads as an invitation to go somewhere else.
  // So the switcher appears only where there is somewhere to switch to, which
  // is both a second mailbox and a handler willing to go there.
  const switcher =
    onSwitchMailbox && mailboxes.length > 1 ? (
      <MailboxSwitcher
        mailboxes={mailboxes}
        activeMailboxId={activeMailboxId}
        onSwitchMailbox={onSwitchMailbox}
        copy={copy}
        className={variant === 'flyout' ? 'border-b border-border pb-3' : 'border-b border-border px-3 pb-3'}
      />
    ) : null

  if (variant === 'flyout') {
    return (
      <div className="flex h-full flex-col">
        {switcher}
        <div className="min-h-0 flex-1 overflow-y-auto pt-2">{nav}</div>
      </div>
    )
  }
  return (
    <aside className={cn('flex-col border-r border-border bg-surface', className)}>
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <Mail size={18} className="text-primary" />
        <span className="text-base font-semibold text-fg">{copy.title}</span>
      </div>
      {switcher}
      <nav className="app-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">{nav}</nav>
    </aside>
  )
}

function ThreadRow({
  thread,
  copy,
  selected,
  onOpen,
}: {
  thread: MailThreadListItem
  copy: MailboxInboxCopy
  selected: boolean
  onOpen: () => void
}) {
  const unread = thread.unread === true
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        'group relative flex cursor-pointer gap-3 border-b border-border-subtle px-3 py-2.5 transition-colors sm:px-4',
        selected ? 'bg-primary-subtle/70' : 'hover:bg-surface-hover',
      )}
    >
      {unread ? <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" aria-hidden /> : null}
      <span
        aria-hidden
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          unread ? 'bg-primary-subtle text-primary' : 'bg-bg-subtle text-fg-muted',
        )}
      >
        {initials(thread.counterparty)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('min-w-0 truncate text-sm', unread ? 'font-semibold text-fg' : 'text-fg')}>
            {thread.counterparty}
          </span>
          {thread.open ? (
            <span
              title={copy.open}
              aria-label={copy.open}
              role="img"
              className="size-1.5 shrink-0 rounded-full bg-success"
            />
          ) : null}
          <time
            suppressHydrationWarning
            dateTime={thread.at}
            className="ml-auto shrink-0 text-[11px] whitespace-nowrap text-fg-subtle"
          >
            {relativeTime(thread.at)}
          </time>
        </div>
        <p className={cn('truncate text-sm', unread ? 'font-medium text-fg' : 'text-fg-muted')}>
          {thread.subject}
        </p>
      </div>
    </div>
  )
}

function AttachmentChip({ attachment, copy }: { attachment: MailAttachmentView; copy: MailboxInboxCopy }) {
  return (
    <a
      href={attachment.href}
      download={attachment.filename}
      title={`${copy.download}: ${attachment.filename}`}
      className="group/chip inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs transition-colors hover:border-primary/40 hover:bg-surface-hover"
    >
      <Paperclip size={13} className="shrink-0 text-fg-subtle" aria-hidden />
      <span className="min-w-0 truncate font-medium text-fg">{attachment.filename}</span>
      <span className="shrink-0 tabular-nums text-fg-subtle">{attachment.sizeLabel}</span>
      <Download
        size={13}
        aria-hidden
        className="shrink-0 text-fg-subtle transition-colors group-hover/chip:text-primary"
      />
    </a>
  )
}

function MessageCard({ message, copy }: { message: MailMessageView; copy: MailboxInboxCopy }) {
  const outbound = message.direction === 'outbound'
  return (
    <article
      className={cn(
        'max-w-[52rem] rounded-xl border px-4 py-3 shadow-sm',
        outbound ? 'ml-auto border-primary/25 bg-primary-subtle/50' : 'mr-auto border-border bg-bg-subtle',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="min-w-0 truncate font-semibold text-fg">{message.fromLabel}</span>
        <ArrowRight size={12} className="shrink-0 text-fg-subtle" aria-hidden />
        <span className="min-w-0 truncate text-fg-muted">{message.toLabel}</span>
        <time
          suppressHydrationWarning
          dateTime={message.at}
          className="ml-auto shrink-0 text-[11px] whitespace-nowrap text-fg-subtle"
        >
          {fullDate(message.at)}
        </time>
      </div>
      {message.bodyText.trim() ? (
        <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-fg">{message.bodyText}</p>
      ) : (
        <p className="mt-2 text-sm text-fg-subtle">{copy.noBody}</p>
      )}
      {message.attachments.length ? (
        <div className="mt-3 border-t border-border-subtle pt-2.5">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
            {copy.attachments}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {message.attachments.map((attachment) => (
              <AttachmentChip key={`${attachment.filename}:${attachment.href}`} attachment={attachment} copy={copy} />
            ))}
          </div>
        </div>
      ) : null}
    </article>
  )
}

function InlineError({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 text-xs text-danger">
      <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
      <span className="min-w-0">{message}</span>
    </p>
  )
}

function ReplyComposer({
  copy,
  replyLabel,
  onReply,
}: {
  copy: MailboxInboxCopy
  replyLabel: string | undefined
  onReply: (text: string) => Promise<void>
}) {
  const fieldId = React.useId()
  const [text, setText] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = text.trim()
    if (!value || busy) return
    setBusy(true)
    setError(null)
    try {
      await onReply(value)
      setText('')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="shrink-0 space-y-2 border-t border-border bg-surface px-4 py-3 sm:px-6 sm:py-4"
    >
      <label htmlFor={fieldId} className="sr-only">
        {replyLabel ?? copy.reply}
      </label>
      <Textarea
        id={fieldId}
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        placeholder={copy.replyPlaceholder}
        rows={3}
        disabled={busy}
        className="min-h-20 resize-y"
      />
      {error ? <InlineError message={error} /> : null}
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-fg-subtle">{replyLabel ?? copy.reply}</span>
        <Button type="submit" size="sm" disabled={busy || !text.trim()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {busy ? copy.sending : copy.send}
        </Button>
      </div>
    </form>
  )
}

function ConversationPane({
  conversation,
  copy,
  replyLabel,
  threadKey,
  onReply,
  onClose,
}: {
  conversation: { subject: string; messages: MailMessageView[] } | null
  copy: MailboxInboxCopy
  replyLabel: string | undefined
  threadKey: string | null
  onReply: (text: string) => Promise<void>
  onClose?: () => void
}) {
  if (!conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-bg-subtle">
          <Mail size={28} className="text-fg-subtle" />
        </div>
        <p className="text-sm font-medium text-fg-muted">{copy.emptyPane}</p>
        <p className="max-w-xs text-xs text-fg-subtle">{copy.emptyPaneDescription}</p>
      </div>
    )
  }

  const count = conversation.messages.length
  const latest = conversation.messages[count - 1]
  const header = (
    <div className="flex items-start gap-3">
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label={copy.back}
          className="-ml-1 rounded-md p-1.5 text-fg-muted hover:bg-surface-hover hover:text-fg lg:hidden"
        >
          <ChevronLeft size={20} />
        </button>
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-subtle">
          <Mail size={18} className="text-primary" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold leading-snug text-fg">{conversation.subject}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          <Badge variant="secondary" className="font-normal">
            {count} {count === 1 ? copy.messageNoun : copy.messagesNoun}
          </Badge>
          {latest ? <span suppressHydrationWarning>{fullDate(latest.at)}</span> : null}
        </div>
      </div>
    </div>
  )
  const body = (
    <div className="space-y-4">
      {conversation.messages.map((message) => (
        <MessageCard key={message.id} message={message} copy={copy} />
      ))}
    </div>
  )
  const composer = (
    <ReplyComposer key={threadKey ?? 'thread'} copy={copy} replyLabel={replyLabel} onReply={onReply} />
  )

  if (onClose) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-border pb-4">{header}</div>
        <div className="app-scroll min-h-0 flex-1 overflow-y-auto py-4">{body}</div>
        {composer}
      </div>
    )
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-6 py-4">{header}</div>
      <div className="app-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">{body}</div>
      {composer}
    </div>
  )
}

function ComposePanel({
  copy,
  variant,
  onCompose,
  onClose,
}: {
  copy: MailboxInboxCopy
  variant: 'pane' | 'drawer'
  onCompose: (draft: { to: string; subject: string; text: string }) => Promise<void>
  onClose: () => void
}) {
  const toId = React.useId()
  const subjectId = React.useId()
  const messageId = React.useId()
  const [to, setTo] = React.useState('')
  const [subject, setSubject] = React.useState('')
  const [text, setText] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await onCompose({ to: to.trim(), subject: subject.trim(), text })
      onClose()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const header = (
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-subtle">
        <SquarePen size={18} className="text-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold leading-snug text-fg">{copy.newMessage}</h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={copy.cancel}
        className="-mr-1 rounded-md p-1.5 text-fg-muted hover:bg-surface-hover hover:text-fg"
      >
        <X size={18} />
      </button>
    </div>
  )
  const fields = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={toId} className="block text-xs font-medium text-fg-muted">
          {copy.to}
        </label>
        <Input
          id={toId}
          type="email"
          required
          value={to}
          onChange={(event) => setTo(event.currentTarget.value)}
          placeholder={copy.toPlaceholder}
          disabled={busy}
          autoComplete="email"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={subjectId} className="block text-xs font-medium text-fg-muted">
          {copy.subject}
        </label>
        <Input
          id={subjectId}
          required
          value={subject}
          onChange={(event) => setSubject(event.currentTarget.value)}
          placeholder={copy.subjectPlaceholder}
          disabled={busy}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={messageId} className="block text-xs font-medium text-fg-muted">
          {copy.message}
        </label>
        <Textarea
          id={messageId}
          required
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
          placeholder={copy.messagePlaceholder}
          disabled={busy}
          className="min-h-40 resize-y"
        />
      </div>
    </div>
  )
  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {error ? (
        <div className="min-w-0 flex-1">
          <InlineError message={error} />
        </div>
      ) : (
        <span className="flex-1" />
      )}
      <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
        {copy.cancel}
      </Button>
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        {busy ? copy.sending : copy.send}
      </Button>
    </div>
  )

  if (variant === 'drawer') {
    return (
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        {fields}
        {actions}
      </form>
    )
  }
  return (
    <form onSubmit={(event) => void submit(event)} className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-6 py-4">{header}</div>
      <div className="app-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">{fields}</div>
      <div className="shrink-0 border-t border-border bg-surface px-6 py-4">{actions}</div>
    </form>
  )
}

export type MailboxInboxProps = {
  mailboxes: MailboxOption[]
  activeMailboxId: string
  /**
   * Where switching mailbox goes. Omit it — or pass a single mailbox — on a
   * surface that is about one mailbox, and the switcher is not rendered.
   */
  onSwitchMailbox?: ((id: string) => void) | undefined
  folder: MailFolderKey
  folderCounts?: Partial<Record<MailFolderKey, number>>
  onSwitchFolder: (key: MailFolderKey) => void
  threads: MailThreadListItem[]
  activeThreadId: string | null
  onSelectThread: (id: string | null) => void
  conversation: { subject: string; messages: MailMessageView[] } | null
  onReply: (text: string) => Promise<void>
  onCompose: (draft: { to: string; subject: string; text: string }) => Promise<void>
  onRefresh?: () => void
  /** Whose voice the reply is sent in — e.g. "Reply as Dana". */
  replyLabel?: string
  className?: string
  copy?: Partial<MailboxInboxCopy>
}

export function MailboxInbox({
  mailboxes,
  activeMailboxId,
  onSwitchMailbox,
  folder,
  folderCounts,
  onSwitchFolder,
  threads,
  activeThreadId,
  onSelectThread,
  conversation,
  onReply,
  onCompose,
  onRefresh,
  replyLabel,
  className,
  copy: copyOverrides,
}: MailboxInboxProps) {
  const copy = React.useMemo(() => ({ ...DEFAULT_COPY, ...copyOverrides }), [copyOverrides])
  const isDesktop = useIsDesktop()
  const [foldersOpen, setFoldersOpen] = React.useState(false)
  const [composeOpen, setComposeOpen] = React.useState(false)

  const total = folderCounts?.[folder] ?? threads.length
  const unread = threads.reduce((count, thread) => (thread.unread ? count + 1 : count), 0)

  const openCompose = () => {
    setFoldersOpen(false)
    setComposeOpen(true)
  }
  const closeCompose = () => setComposeOpen(false)
  const selectFolder = (key: MailFolderKey) => {
    setFoldersOpen(false)
    onSwitchFolder(key)
  }
  const selectThread = (id: string) => {
    setComposeOpen(false)
    onSelectThread(id)
  }

  const railProps = {
    mailboxes,
    activeMailboxId,
    onSwitchMailbox,
    folder,
    folderCounts,
    onSwitchFolder: selectFolder,
    copy,
  }

  const listBody = threads.length ? (
    threads.map((thread) => (
      <ThreadRow
        key={thread.id}
        thread={thread}
        copy={copy}
        selected={thread.id === activeThreadId}
        onOpen={() => selectThread(thread.id)}
      />
    ))
  ) : (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-bg-subtle text-fg-subtle">
        <Inbox size={26} />
      </div>
      <p className="mt-3 text-sm font-medium text-fg-muted">{copy.emptyList}</p>
      <p className="mt-1 text-xs text-fg-subtle">{copy.emptyListDescription}</p>
    </div>
  )

  return (
    <div className={cn('flex h-full min-h-0 bg-bg-subtle', className)}>
      <FolderRail {...railProps} variant="rail" className="hidden w-64 shrink-0 lg:flex" />
      <section className="flex min-w-0 flex-1 flex-col border-r border-border bg-surface lg:w-96 lg:flex-none xl:w-[28rem]">
        <header className="shrink-0 border-b border-border">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
            <button
              type="button"
              onClick={() => setFoldersOpen(true)}
              aria-label={copy.folders}
              className="-ml-1 rounded-md p-1.5 text-fg-muted hover:bg-surface-hover hover:text-fg lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold text-fg">{copy[folder]}</h1>
              <p className="text-[11px] text-fg-subtle">
                {total} {total === 1 ? copy.conversation : copy.conversations}
                {unread ? ` · ${unread} ${copy.unread}` : ''}
              </p>
            </div>
            {onRefresh ? (
              <button
                type="button"
                onClick={onRefresh}
                title={copy.refresh}
                aria-label={copy.refresh}
                className="rounded-md p-1.5 text-fg-muted hover:bg-surface-hover hover:text-fg"
              >
                <RotateCw size={18} />
              </button>
            ) : null}
            <Button size="sm" onClick={openCompose}>
              <SquarePen size={14} />
              {copy.newMessage}
            </Button>
          </div>
        </header>
        <div className="app-scroll min-h-0 flex-1 overflow-y-auto">{listBody}</div>
      </section>
      <section className="hidden min-w-0 flex-1 bg-surface lg:flex">
        <div className="w-full">
          {composeOpen ? (
            <ComposePanel copy={copy} variant="pane" onCompose={onCompose} onClose={closeCompose} />
          ) : (
            <ConversationPane
              conversation={conversation}
              copy={copy}
              replyLabel={replyLabel}
              threadKey={activeThreadId}
              onReply={onReply}
            />
          )}
        </div>
      </section>
      {!isDesktop ? (
        <>
          <Drawer
            open={foldersOpen}
            onClose={() => setFoldersOpen(false)}
            side="left"
            size="sm"
            title={copy.folders}
            disableFullscreen
            bodyClassName="min-h-0 flex-1 overflow-hidden px-4 py-5"
          >
            <FolderRail {...railProps} variant="flyout" />
          </Drawer>
          <Drawer
            open={Boolean(activeThreadId) && !composeOpen}
            onClose={() => onSelectThread(null)}
            size="lg"
            title={conversation?.subject}
            disableFullscreen
          >
            {activeThreadId && !composeOpen ? (
              <ConversationPane
                conversation={conversation}
                copy={copy}
                replyLabel={replyLabel}
                threadKey={activeThreadId}
                onReply={onReply}
                onClose={() => onSelectThread(null)}
              />
            ) : null}
          </Drawer>
          <Drawer
            open={composeOpen}
            onClose={closeCompose}
            size="lg"
            title={copy.newMessage}
            disableFullscreen
          >
            {composeOpen ? (
              <ComposePanel copy={copy} variant="drawer" onCompose={onCompose} onClose={closeCompose} />
            ) : null}
          </Drawer>
        </>
      ) : null}
    </div>
  )
}

export function MailboxInboxSkeleton({ className }: { className?: string } = {}) {
  return (
    <div
      role="status"
      aria-label="Loading mailbox"
      aria-busy="true"
      className={cn('flex h-full min-h-0 bg-bg-subtle', className)}
    >
      <div className="hidden w-64 shrink-0 flex-col gap-2 border-r border-border p-3 lg:flex">
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="mt-2 h-9 w-full rounded-lg" />
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full rounded-lg" />
        ))}
      </div>
      <section className="flex min-w-0 flex-1 flex-col border-r border-border bg-surface lg:w-96 lg:flex-none xl:w-[28rem]">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="ml-auto h-8 w-28 rounded-md" />
        </div>
        <div className="flex-1 overflow-hidden">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-3 border-b border-border-subtle px-3 py-3 sm:px-4"
            >
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </section>
      <div className="hidden min-w-0 flex-1 items-center justify-center lg:flex">
        <Skeleton className="size-10 rounded-full" />
      </div>
    </div>
  )
}
