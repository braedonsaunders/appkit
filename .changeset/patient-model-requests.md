---
'@appkit/sync': minor
'@appkit/ai': minor
---

Stop killing model requests that are merely slow.

Outbound requests through `secureFetch` were capped at two minutes, and
`@appkit/ai` asked for exactly that. Two minutes is a sensible ceiling for the
webhooks and REST calls the egress guard was written for, and it is inside the
normal range for the one thing that legitimately takes longer: a reasoning model
working through a tool-using turn.

Measured against several hosted models, single steps regularly ran past two
minutes and the socket was destroyed mid-generation. The failure is worse than a
slow answer. The provider had streamed nothing and billed nothing, so there was
no partial result to keep; the caller saw only `Outbound request timed out after
119993 ms`; and for an agent loop the whole run died with it, discarding every
step that had already completed and been paid for. Two consecutive runs of one
scheduled task were lost this way with zero tokens spent.

`MAX_TIMEOUT_MS` in the egress guard rises to fifteen minutes and
`AI_REQUEST_TIMEOUT_MS` to ten. Neither is a budget — callers still state their
own timeout and their own loop governs how much work is done — this only stops
the guard refusing a wait that a caller has good reason to ask for. The ceiling
remains, because an unbounded wait is how a worker wedges.
