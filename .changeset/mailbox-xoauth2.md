---
'@appkit/mailbox': minor
---

XOAUTH2: `MailboxConnection.accessToken` authenticates IMAP and SMTP with OAuth 2.0 instead of a password. Set it and both endpoints negotiate XOAUTH2 (`password` is ignored and may be `''`); leave it unset and nothing changes. This is what Google Workspace requires and what Microsoft 365 now requires exclusively, having retired basic auth for IMAP/SMTP. The engine stays token-shaped rather than flow-shaped: the application mints a short-lived access token from its own stored refresh token per operation, so no client secret ever reaches the transport.
