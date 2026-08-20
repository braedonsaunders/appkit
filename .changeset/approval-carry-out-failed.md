---
'@braedonsaunders/appkit-ai': minor
---

Let an inline approval say that carrying the decision out failed.

`AgentApprovalRequestStatus` gains `failed`, distinct from `rejected`: the
decision was made and the action was attempted, and it is acting on it that did
not work. `AgentApprovalRequestPart` gains an optional `failureReason` shown
verbatim beside it, and the labels gain `carryOutFailed` for the state itself —
separate from the existing `failed`, which means the decision could not be
saved and the reader should press again.

Without this a decided approval whose execution died had nowhere truthful to
sit: it stayed `approved`, so the card went on promising the agent would
continue automatically while nothing was happening, and the only reading left
to the person waiting was that the agent had forgotten. The failed state
renders as an alert rather than the quiet muted line the other settled states
use, because it is the one the reader has to act on.

Additive for every consumer: the labels are taken as `Partial` on both
`AgentPanel` and `AgentApprovalRequestCard`, and parts that never carry the new
status are unaffected.
