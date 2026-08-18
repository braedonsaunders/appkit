# @braedonsaunders/appkit-remote-sessions

Remote computers are not agent desks. A desk is an application-owned machine belonging to an agent; a remote session connects that agent to an existing customer computer or appliance over RDP, VNC, SSH, WinRM, PowerShell-over-SSH, or Telnet.

This package extracts Steward's working remote-computer model and hardens its reusable boundary: provider-neutral targets, fenced immutable leases, append-only events, one-time viewer grants, cancellation, terminal output, programmatic RDP/VNC actions with returned frames, an injected credential resolver, policy ports, a memory adapter, provider conformance, and a browser-safe React viewer. The application owns tenant persistence, authorization, feature gates, credentials, audit projection, routes, and the provider bridge.

```ts
const remote = createRemoteSessionService({ store, provider, policy, resolveCredential })
const session = await remote.open({ target, runId, personId, kind: 'computer' })
const lease = await remote.lease({ tenantId, sessionId: session.id, holder: userId, purpose: 'Watch the agent work', scope: 'observe' })
const connection = await remote.viewer({ tenantId, sessionId: session.id, leaseId: lease.id })
const result = await remote.control({ tenantId, sessionId: session.id, action: { action: 'click', x: 420, y: 180 } })
```

Never persist provider viewer URLs or raw credentials. Exchange a short-lived, signed AppKit grant inside an authenticated same-origin route, atomically consume its grant id, and return a fresh provider connection. Releasing a lease is terminal: a still-valid signed grant must not recreate it.
