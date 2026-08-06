# @appkit/mailbox

## 1.0.0

### Minor Changes

- d1b2a0c: `MailboxInbox` only draws the mailbox switcher when there is somewhere to switch
  to.

  The rail always rendered the picker, so an inbox opened on the person it belongs
  to — an agent's own mail, on that agent's record — showed a "Mailbox" select
  whose one option was the mailbox already on screen, and whose other options led
  away from the record you had just opened. A control that either changes nothing
  or navigates out of the surface it sits in is worse than no control.

  `onSwitchMailbox` is now optional: the switcher renders only when a handler is
  supplied _and_ `mailboxes` holds more than one. Nothing changes for a
  multi-mailbox operator screen, which passes both. A single-mailbox surface can
  now pass `mailboxes={[theOne]}` and omit the handler, and the rail is its folder
  list alone.

### Patch Changes

- Updated dependencies [22e968a]
- Updated dependencies [9f04661]
  - @appkit/ui@0.2.0

## 0.5.0

### Minor Changes

- dd80c45: Outbound attachments: `SendMailArgs.attachments` carries `{ filename, content, contentType?, contentId? }` entries through to SMTP, including `cid:` inline references from the HTML body. Inbound attachments were already parsed; the send side now matches.
- b826626: Add the `@appkit/mailbox/react` operator surface: `MailboxInbox` and
  `MailboxInboxSkeleton`. The engine could sync and send but had no screen, so
  every application built its own mail client over it.

  `MailboxInbox` is the three-pane inbox — mailbox switcher plus Inbox/Sent/All
  mail folder rail, thread list, and a reading pane that renders the conversation
  as inbound/outbound message cards with from → to lines, whitespace-preserved
  bodies, and downloadable attachment chips, a reply composer pinned to the
  bottom of the pane, and a compose panel behind the "New message" action. It
  follows `@appkit/notifications`' `NotificationInbox` layout, folder rail, row
  anatomy, empty states, and responsive drawers so mail and notifications read as
  one product.

  It is fully controlled: the application owns the mailboxes, folder counts,
  threads, selection, and conversation, and supplies `onReply` / `onCompose` /
  `onRefresh`; only the drafts and their busy/error state live in the component.
  `react`, `react-dom`, `@appkit/ui`, and `lucide-react` are optional peers, so
  the node entry still imports with none of them installed.

- 78d6c9f: XOAUTH2: `MailboxConnection.accessToken` authenticates IMAP and SMTP with OAuth 2.0 instead of a password. Set it and both endpoints negotiate XOAUTH2 (`password` is ignored and may be `''`); leave it unset and nothing changes. This is what Google Workspace requires and what Microsoft 365 now requires exclusively, having retired basic auth for IMAP/SMTP. The engine stays token-shaped rather than flow-shaped: the application mints a short-lived access token from its own stored refresh token per operation, so no client secret ever reaches the transport.

### Patch Changes

- Updated dependencies [0c2dde7]
- Updated dependencies [0c2dde7]
- Updated dependencies [a1d5d50]
- Updated dependencies [8a17e9e]
  - @appkit/ui@0.1.10
