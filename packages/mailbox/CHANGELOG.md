# @appkitjs/mailbox

## 0.5.0

### Minor Changes

- dd80c45: Outbound attachments: `SendMailArgs.attachments` carries `{ filename, content, contentType?, contentId? }` entries through to SMTP, including `cid:` inline references from the HTML body. Inbound attachments were already parsed; the send side now matches.
- b826626: Add the `@appkitjs/mailbox/react` operator surface: `MailboxInbox` and
  `MailboxInboxSkeleton`. The engine could sync and send but had no screen, so
  every application built its own mail client over it.

  `MailboxInbox` is the three-pane inbox — mailbox switcher plus Inbox/Sent/All
  mail folder rail, thread list, and a reading pane that renders the conversation
  as inbound/outbound message cards with from → to lines, whitespace-preserved
  bodies, and downloadable attachment chips, a reply composer pinned to the
  bottom of the pane, and a compose panel behind the "New message" action. It
  follows `@appkitjs/notifications`' `NotificationInbox` layout, folder rail, row
  anatomy, empty states, and responsive drawers so mail and notifications read as
  one product.

  It is fully controlled: the application owns the mailboxes, folder counts,
  threads, selection, and conversation, and supplies `onReply` / `onCompose` /
  `onRefresh`; only the drafts and their busy/error state live in the component.
  `react`, `react-dom`, `@appkitjs/ui`, and `lucide-react` are optional peers, so
  the node entry still imports with none of them installed.

- 78d6c9f: XOAUTH2: `MailboxConnection.accessToken` authenticates IMAP and SMTP with OAuth 2.0 instead of a password. Set it and both endpoints negotiate XOAUTH2 (`password` is ignored and may be `''`); leave it unset and nothing changes. This is what Google Workspace requires and what Microsoft 365 now requires exclusively, having retired basic auth for IMAP/SMTP. The engine stays token-shaped rather than flow-shaped: the application mints a short-lived access token from its own stored refresh token per operation, so no client secret ever reaches the transport.

### Patch Changes

- Updated dependencies [0c2dde7]
- Updated dependencies [0c2dde7]
- Updated dependencies [a1d5d50]
- Updated dependencies [8a17e9e]
  - @appkitjs/ui@0.1.10
