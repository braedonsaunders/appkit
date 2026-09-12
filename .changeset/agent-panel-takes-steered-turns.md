---
'@braedonsaunders/appkit-ai': patch
---

`AgentPanel` now shows a turn the person adds while it is streaming.

The host-transcript reconciliation stood down entirely during a stream, because the parts the panel is receiving are richer than anything the host has persisted and replacing them mid-answer loses detail. That is right about the assistant and wrong about the person: a reader can speak into a turn that is already running — steering it, or releasing a queued message into it — and the host appends that to the transcript immediately. Standing down meant their own words appeared nowhere. The message was recorded, the agent was already acting on it, and the screen showed no trace of it.

A streaming panel now takes `user` turns from the host, inserted before the in-flight assistant message, which is where they sit once the run ends and the whole transcript is adopted — so nothing jumps when it does. Assistant messages are never taken from the host in this path, so a host-side provisional answer cannot duplicate the one being streamed.

A provisional turn the host later withdraws is dropped rather than left beside its replacement: a queued message is rendered from the queue until it is delivered, at which point it becomes a real turn under a real id, and holding both would print the same sentence twice. Turns the panel owns — the optimistic message a submit appends under its own id, which the host has not persisted yet — were never host ids and are never dropped.
