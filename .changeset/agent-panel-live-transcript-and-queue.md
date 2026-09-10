---
'@braedonsaunders/appkit-ai': minor
---

AgentPanel takes newer transcripts from its host, and the queue earns its space

Three changes, all about a panel whose host can see more than the panel can.

`initialMessages` is now reconciled, not just seeded. Seeding once was right
while the only transcript was what had already been recorded — anything newer
arrived through the stream. It is wrong for a host that can also observe work in
progress: a turn running in a worker, or the turn a reader has just reloaded into
the middle of. Without this, the only way a host could show a tool call made a
second ago was to remount the panel, which throws away whatever the person was
part-way through typing. The reconciliation is guarded on `streaming` and on
there being no live request, because while the panel owns the turn its streamed
parts are richer than anything the host has persisted yet. Comparison is
structural but shallow — a new message, a new part, a call moving from running to
returned, or prose growing — because these parts carry whole tool inputs and
outputs and the host rebuilds the array on every render.

`AgentMessageQueue` is about half as tall. It sits between the transcript and the
composer, so every row it spends is a row taken from the conversation being read.
The standing title line is gone: the `section` still carries it as an accessible
name, and a numbered row whose own status reads "Queued" does not also need a
heading to say so. Padding, the position badge and the action buttons each drop a
notch.

`onSendQueuedMessageNow` is new, with a `sendQueuedNow` label and a `sendable`
flag on `AgentQueuedMessage`. A queued message otherwise goes when the
conversation gets to it, and there was no way to say "go now" without deleting it
and typing it again. `sendable: false` lets a host suppress the action where it
knows the send would be refused, rather than offering a button that fails.
