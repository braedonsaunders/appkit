---
'@appkit/mailbox': minor
---

Outbound attachments: `SendMailArgs.attachments` carries `{ filename, content, contentType?, contentId? }` entries through to SMTP, including `cid:` inline references from the HTML body. Inbound attachments were already parsed; the send side now matches.
