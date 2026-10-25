---
'@braedonsaunders/appkit-emails': patch
'@braedonsaunders/appkit-mailbox': patch
---

Move SMTP delivery to nodemailer 10.2 (GHSA advisories against every 9.x and
10.0.x release). The send path is unchanged; nodemailer 10 requires Node 20 or
newer, which AppKit already requires.
