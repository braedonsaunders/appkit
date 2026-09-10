---
'@braedonsaunders/appkit-ai': minor
---

AgentPanel shows a turn in flight that it is not streaming itself

The thinking indicator keyed off `streaming` alone, so a turn running somewhere
else — in a worker, or one the reader has just reloaded into the middle of — had
no sign of life in the transcript at all. Hosts were left explaining in a banner
beside the conversation that something was happening elsewhere, which is not
where anyone looks and reads as an apology rather than progress.

`working` says a turn is in flight that this panel is not producing. The
indicator now rides along with the LAST assistant turn whenever that panel is
streaming OR the host reports work, and it sits under whatever parts have
already arrived rather than replacing them — so a turn with three tool cards and
more coming looks exactly like a turn in progress, because that is what it is.

`MemoAgentMessageRow` takes `pending` in place of `streaming`: a row only ever
needed to know whether IT was the one still going, never the panel's transport
state, and the narrower prop memoizes better.
