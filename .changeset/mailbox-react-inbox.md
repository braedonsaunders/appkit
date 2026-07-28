---
'@appkit/mailbox': minor
---

Add the `@appkit/mailbox/react` operator surface: `MailboxInbox` and
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
