# @braedonsaunders/egress-proxy

The fail-closed egress chokepoint for agent sandboxes: explicit HTTP and
CONNECT proxying plus transparent DNAT interception, with the destination
recovered from TLS SNI or the Host header, a caller-supplied allow/deny
policy, and an audit entry for every decision. Zero runtime dependencies —
Node stdlib only.

## Why the proxy sits outside the guest

An agent with a root shell inside its own machine can unset any proxy
environment variable, rewrite its own resolver, or open raw sockets.
Per-process egress controls inside that boundary are therefore not
enforcement — they are a suggestion the agent is one line of shell away from
declining. This proxy is built to run on the *host*, outside the boundary the
agent controls, with all guest traffic transparently DNAT'd into it. The
guest cannot opt out: there is no proxy setting to unset, and the redirect
covers every application including those that ignore `HTTP_PROXY`.

One listener accepts three connection shapes:

- **Explicit HTTP proxying** — absolute-form requests
  (`GET http://host/path HTTP/1.1`). The head is rewritten to origin form,
  hop-by-hop and proxy-credential headers (`proxy-authorization` among them)
  are stripped, `connection: close` is forced so a pipelined second request
  can never ride an already-authorized flow, and the body is spliced through.
- **CONNECT tunneling** — the host check happens at CONNECT time; a denial is
  a 403 before any client byte reaches the destination; an allow becomes a
  bidirectional pipe. TLS is never broken open.
- **Transparent interception** — a DNAT'd flow where the client never learns a
  proxy exists. For TLS the ClientHello is peeked and the SNI extracted with a
  pure parser, without terminating TLS; for plain HTTP the Host header is
  sniffed the same way. A flow whose destination cannot be recovered — a
  truncated or malformed ClientHello, a request with no Host header, raw bytes
  in an unknown protocol — is denied and audited. Nothing is guessed.

## Usage

```ts
import { createEgressProxy } from '@braedonsaunders/egress-proxy'

const proxy = createEgressProxy({
  policy: ({ host, port, protocol, principal }) =>
    allowlistFor(principal).has(host) ? 'allow' : 'deny',
  audit: (entry) => ledger.append(entry),
  listen: { host: '10.200.0.1', port: 3128 },
  principalFor: (socket) => agentByTapAddress(socket.remoteAddress),
})

const bound = await proxy.listen()
// ... proxy.stats() → { active, total, denied }
await proxy.close()
```

## The policy and audit port contract

The **policy** port is consulted once per flow, before any byte reaches the
destination, with `{ host, port, protocol, principal }`. `host` is the
normalized hostname (IDNA, lower-case, brackets stripped). `protocol` is
`https` for SNI-sniffed flows and CONNECT to port 443, `http` for plain HTTP
in either form, and `tcp` for CONNECT to any other port — the tunnel is
opaque, so the payload protocol is unknown. The policy may be synchronous or
asynchronous. Anything other than a clean `'allow'` return — a `'deny'`, a
throw, a rejection — denies the flow. The consuming application supplies the
actual rules; this package only enforces them at the boundary.

The **audit** port receives an entry for every decision, allow and deny alike,
with host, port, protocol, principal, decision, reason, and timestamp:

- `decision` — every allow and every deny, including denials for unparseable
  destinations (where `host` is null) and policy exceptions.
- `upstream-error` — a failure after an allow: either the destination was
  refused by host policy (`decision: 'deny'`) or the connection itself failed
  (`decision: 'allow'`).
- `flow-closed` — byte counts in each direction when an established flow ends.

The audit sink must not throw; a sink that does loses that one entry, never
the connection.

Denied flows that speak HTTP to the proxy get a 403 with a short plain-text
body naming the denial. Transparent TLS flows are simply closed — there is no
way to say 403 into a TLS handshake without impersonating the destination.

## Upstream address policy

Allowing a hostname is not the same as allowing the address it resolves to: a
guest can register a public name that resolves to `10.0.0.5`. By default the
proxy resolves allowed destinations itself and requires **every** DNS answer
to be public — rejecting the whole answer set rather than picking a public
answer, since round-robin fallback would otherwise reach a private address —
and then connects to the checked address rather than re-resolving. The same
block lists cover IPv4 and IPv6 (kept separate because Node's `BlockList`
treats IPv4 input as v4-mapped IPv6 when a mapped subnet is present, which
would reject every IPv4 address). Supply `resolveUpstream` to integrate a
different resolver; whatever it returns is dialled verbatim, so it inherits
responsibility for the address check.

The canonical treatment of these host rules lives in `@braedonsaunders/sync`'s egress
module; this package mirrors the logic locally to stay dependency-free.

## Transparent deployment sketch

On the sandbox host, redirect everything the guest emits on its tap device
into the proxy. The guest routes normally; the host rewrites the destination
before the packet ever leaves.

```sh
# All TCP from the guest tap is redirected into the egress proxy.
# The guest cannot opt out — there is no proxy setting to unset, and this
# covers every application including those that ignore HTTP_PROXY.
iptables -t nat -A PREROUTING -i tap-agent0 -p tcp \
  -j REDIRECT --to-ports 3128

# Or, when the proxy runs on another interface of the same host:
iptables -t nat -A PREROUTING -i tap-agent0 -p tcp \
  -j DNAT --to-destination 10.200.0.1:3128

# UDP is not proxied: give the guest a host-side resolver and drop the rest,
# or QUIC and arbitrary UDP become an unaudited side channel.
iptables -A FORWARD -i tap-agent0 -p udp ! --dport 53 -j DROP
```

Under `REDIRECT`, the original destination port is recoverable via
`SO_ORIGINAL_DST`; supply it through `originalDestinationFor` and the proxy
will use that port for transparent flows. Without it, transparent TLS assumes
443 and transparent HTTP uses the Host header port or 80
(`transparentHttpsPort` / `transparentHttpPort` override the defaults). The
hostname always comes from SNI or the Host header — a name is what the policy
reasons about.

Attribute flows to agents with `principalFor`, typically by the source address
of the guest tap. The principal reaches both the policy and every audit entry.

## No MITM by default

TLS is never terminated. The host check happens at CONNECT time or from the
peeked SNI, so the proxy sees who the guest talks to but never what is said.
There is no TLS interception code path in this package at all — no
certificate authority, no re-encryption, no flag to turn one on — so a
deployment cannot drift into interception by misconfiguration.

## Scope and limitations

- Destination identity comes from client-supplied bytes (SNI, Host). The
  policy check gates the *name*, and the upstream connection goes to the
  address that name resolves to on the host side — so lying in the SNI sends
  the guest's bytes to the named host, not to the one it was trying to smuggle
  traffic toward. Distinguishing virtual hosts behind one address is the
  policy's concern, not the transport's.
- One destination per connection. Explicit HTTP forces `connection: close`;
  transparent flows splice bytes to a single checked destination.
- TCP only. UDP (including QUIC and DNS) must be handled at the firewall, as
  in the sketch above.

## Deferred

- **MITM with a generated CA** for body-level audit is deliberately not
  implemented, matching the build spec's deferred list (§9). Shipping a
  half-implementation would put a CA key on the chokepoint for no enforcement
  gain; the decision point returns if body-level audit ever becomes a real
  requirement.
- **Built-in `SO_ORIGINAL_DST` recovery.** Reading the original destination is
  a platform-specific `getsockopt`; the `originalDestinationFor` hook is the
  seam where a Linux deployment plugs it in.
