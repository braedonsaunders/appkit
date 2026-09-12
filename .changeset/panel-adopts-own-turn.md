---
'@braedonsaunders/appkit-ai': patch
---

`AgentPanel` no longer prints a sent message twice while its turn streams.

A submit appends the message optimistically under a `user-<stamp>` id, and the host persists the same sentence under its durable id moments later. Reconciliation matched turns by id alone, so the persisted twin read as a second, steered turn and joined the optimistic one — one enter key, two bubbles — until the run ended and the whole transcript was adopted. An optimistic turn whose exact text the host now carries is adopted in place instead: the durable turn takes the optimistic seat. Genuinely new text still appends as before, and a repeated sentence still lands twice.

Also in this patch: streamed output stops yanking the reader. New arrivals auto-scroll only while the reader is already pinned to the live edge; someone scrolled up reading history stays where they are. A fresh submit and the initial open still go straight to the bottom.
