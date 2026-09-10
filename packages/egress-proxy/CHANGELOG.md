# @braedonsaunders/appkit-egress-proxy

## 0.2.1

### Patch Changes

- e67bb83: `secureFetch`'s outbound ceiling now measures silence rather than total elapsed time.

  Streaming the response body moved the moment an exchange settles from "headers arrived" to "body ended", which turned the one timer armed at the request into a hard cap on the whole transfer. A response that is healthy and slow — a model writing a long answer — was destroyed for being long: an agent step died at exactly its 600000 ms ceiling with tokens still arriving and the reply half-written, reported as a timeout.

  The timer is now refreshed on every body chunk, so both failures it exists for still fire — a server that never answers, and a body that stops mid-transfer — while an actively streaming response is never cut off. Its message says which happened: `Outbound request timed out after N ms without progress.`

## 0.2.0

### Minor Changes

- 52ac979: secureFetch returns a readable body instead of buffering the whole response

  The guard drained every response to completion and handed back a fully
  materialized body. For a webhook or a JSON API that cost nothing. It was fatal
  for the one response shape worth reading as it arrives: a model's token stream
  over server-sent events. Any provider reached through `secureAiFetch` — every
  `openai-compatible` kind, so OpenRouter, Groq, xAI, DeepSeek, Mistral and custom
  endpoints — therefore could not stream at all. The AI SDK saw the first byte only
  after the last one, so an agent's whole answer landed in a single burst at the
  end of each step, however long the step took.

  The response body is now a `ReadableStream` fed from the socket. Every existing
  protection is unchanged: DNS is still validated immediately before connect and
  the socket still pins to the selected answer, TLS/SNI is still checked against
  the original hostname, redirects are still re-validated per hop and their bodies
  discarded, and `maxResponseBytes` is still enforced — now counted as bytes pass,
  so exceeding it errors the body mid-read and destroys the socket rather than
  refusing to return an oversized buffer. The request timeout now governs the whole
  exchange rather than being released once headers arrive, so a stalled body cannot
  wedge a worker.

  One consequence worth stating: a caller that never reads or cancels a response
  body holds its socket until that request's timeout, which is how the platform's
  own `fetch` behaves. Every caller in this repo consumes its body or takes a
  no-body path.

## 0.1.1

### Patch Changes

- cfe19a9: Move the DNS-pinned, SSRF-safe HTTPS transport into the shared egress package and remove AI's accidental runtime dependency on the data-sync package. Sync continues to re-export the transport for compatibility.
