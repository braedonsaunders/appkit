---
'@appkitjs/mailbox': minor
---

`MailboxInbox` only draws the mailbox switcher when there is somewhere to switch
to.

The rail always rendered the picker, so an inbox opened on the person it belongs
to — an agent's own mail, on that agent's record — showed a "Mailbox" select
whose one option was the mailbox already on screen, and whose other options led
away from the record you had just opened. A control that either changes nothing
or navigates out of the surface it sits in is worse than no control.

`onSwitchMailbox` is now optional: the switcher renders only when a handler is
supplied *and* `mailboxes` holds more than one. Nothing changes for a
multi-mailbox operator screen, which passes both. A single-mailbox surface can
now pass `mailboxes={[theOne]}` and omit the handler, and the rail is its folder
list alone.
