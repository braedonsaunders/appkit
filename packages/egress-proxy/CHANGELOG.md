# @braedonsaunders/appkit-egress-proxy

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
