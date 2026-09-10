---
'@braedonsaunders/appkit-egress-proxy': patch
---

`secureFetch`'s outbound ceiling now measures silence rather than total elapsed time.

Streaming the response body moved the moment an exchange settles from "headers arrived" to "body ended", which turned the one timer armed at the request into a hard cap on the whole transfer. A response that is healthy and slow — a model writing a long answer — was destroyed for being long: an agent step died at exactly its 600000 ms ceiling with tokens still arriving and the reply half-written, reported as a timeout.

The timer is now refreshed on every body chunk, so both failures it exists for still fire — a server that never answers, and a body that stops mid-transfer — while an actively streaming response is never cut off. Its message says which happened: `Outbound request timed out after N ms without progress.`
