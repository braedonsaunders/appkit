# @braedonsaunders/appkit-remote-sessions

Remote computers are not agent desks. A desk is an application-owned machine belonging to an agent; a remote session connects that agent to an existing customer computer or appliance over RDP, VNC, SSH, WinRM, PowerShell-over-SSH, or Telnet.

This package extracts Steward's working remote-computer model and terminal presentation and hardens their reusable boundary: provider-neutral targets, fenced immutable leases, append-only events, one-time viewer grants, cancellation, terminal output, programmatic RDP/VNC actions with returned frames, an injected credential resolver, policy ports, a memory adapter, provider conformance, a browser-safe React viewer, and a read-only `TerminalSurface` that renders an application-owned durable command ledger. The application owns tenant persistence, authorization, feature gates, credentials, audit projection, routes, and the provider bridge.

```ts
const remote = createRemoteSessionService({ store, provider, policy, resolveCredential })
const session = await remote.open({ target, runId, personId, kind: 'computer' })
const lease = await remote.lease({ tenantId, sessionId: session.id, holder: userId, purpose: 'Watch the agent work', scope: 'observe' })
const connection = await remote.viewer({ tenantId, sessionId: session.id, leaseId: lease.id })
const result = await remote.control({ tenantId, sessionId: session.id, action: { action: 'click', x: 420, y: 180 } })
```

Never persist provider viewer URLs or raw credentials. Exchange a short-lived, signed AppKit grant inside an authenticated same-origin route, atomically consume its grant id, and return a fresh provider connection. Releasing a lease is terminal: a still-valid signed grant must not recreate it.

`TerminalSurface` is deliberately execution-free. Feed it recorded command,
stdout, stderr, system, and status entries from the same append-only session record used
for audit; do not create a browser-only scrollback that can disagree with the
run history. Import `@braedonsaunders/appkit-remote-sessions/styles.css` once in
the host stylesheet. The surface uses xterm.js for ANSI color, Unicode,
selection, terminal-native scrollback, and responsive fitting while remaining
read-only. Durable non-PTY output is still terminal-grade: AppKit adds
deterministic semantic ANSI to unstyled prompts and shell tokens (commands,
flags, strings, variables, and operators), distinguishes stdout, stderr, system,
and status entries, and maps that palette through AppKit's light/dark tokens.
Provider ANSI is passed through unchanged rather than recolored. It opens at the
latest output and continues following while the
viewer remains near the bottom. Scrolling upward suspends that behavior so
polling or new output cannot pull the viewer away from what they are reading.
Hosts can add contextual controls such as fullscreen through `headerActions`;
placeholder working directories (`.` and `./`) are intentionally hidden.
