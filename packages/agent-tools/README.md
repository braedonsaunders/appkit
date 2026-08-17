# @appkitjs/agent-tools

A governed catalogue of command-line tools an agent may install and run.

A shell ability lets an agent run whatever is already in the image. This package
is the layer above that: named tools, declared in a manifest, each carrying its
own risk, capabilities, health check, network requirement, and resource
ceilings. Adding `ripgrep` or `pandoc` to an agent's reach becomes a catalogue
entry rather than a Dockerfile change, and every install and every execution
passes a policy gate first.

Execution goes through `@appkitjs/process-sandbox`. There is no unsandboxed path:
the runner throws on a host without bubblewrap rather than falling back.

## The base-image manifest

Against an agent that has a terminal, the install and execute gates enforce
nothing — one line in a shell walks around them. But the manifest's other
properties never depended on the gate: exact pinned versions, health checks,
an operator-visible shelf, and revocability all survive. So the manifest is
also the declaration of what a golden VM base image contains. A tool with
`sourceKind: 'apt-package'` pins a Debian package (`aptPackage` +
`aptVersion`, exact — never a range) that the image build installs; the
runtime never installs it, and `install()` only verifies the declared
executables exist on disk before marking the record installed. Consumers not
on a desk keep using the gated paths exactly as before.

`@appkitjs/agent-tools/image-manifest` turns a shelf into build input:

```ts
import { imageManifest, renderAptInstallFragment } from '@appkitjs/agent-tools/image-manifest'

const build = imageManifest(tools)
// { aptPackages: [{ name, version, toolId }], npmPackages: [...], binaryPaths: [...] }
// Deterministically sorted; throws when two tools pin one package differently.

const fragment = renderAptInstallFragment(tools)
// apt-get install -y --no-install-recommends \
//   jq=1.7.1-3 \
//   ripgrep=14.1.0-1
```

## The two gates

Installing a tool and running one are separate questions with separate policies.
Approving the first never implies the second.

| Mode | Meaning |
| --- | --- |
| `deny` | Refused outright; no request is filed. |
| `approval` | Always asks a person. |
| `allow_safe` | Proceeds for low-risk, network-isolated tools; asks for the rest. |
| `allow_all` | Proceeds. |

A tool is "safe" only when it is low risk **and** cannot reach the network while
it runs. A low-risk tool that phones out is still a tool that phones out.

## Grants are bounded

An approval is not a permanent permission. Each one carries:

- a **scope** — a digest of exactly what was asked. A grant for
  `upload ./report.pdf` never covers `upload /etc/shadow`. Tools whose every
  invocation is equally safe can opt into `approvalScope: 'command'`.
- a **grant expiry** — how long the answer stands.
- a **use count** — how many executions it permits, defaulting to one.

A refusal is bounded the same way, so an agent that was told no cannot re-file
the same question in a loop, and a stale no does not last forever. Spending a
use goes through `store.consumeGrant`, which the Drizzle adapter implements as a
single conditional `UPDATE` so two concurrent runs cannot both spend the last one.

## Isolation

| | Install | Health check | Execution |
| --- | --- | --- | --- |
| Network | host — the registry is the point | none | `none` unless the manifest says `requiresNetwork` |
| Writable | the tool's install directory | nothing | only the caller's `workdir` |
| Read-only | — | the tool's own bytes | the tool's own bytes, `/usr`, `/etc`, `/opt` |

npm installs run with `--ignore-scripts`. Lifecycle scripts are arbitrary code
from the registry running with the installer's reach; a CLI that needs them is
not a managed tool. Versions must be exact — a range would let the installed
bytes change under an approval granted against a specific version.

## Usage

```ts
import {
  createAgentToolRuntime,
  createProcessSandboxRunner,
  defineAgentTool,
} from '@appkitjs/agent-tools'
import { createDrizzleAgentToolStore } from '@appkitjs/agent-tools/drizzle'

const runtime = createAgentToolRuntime({
  store: createDrizzleAgentToolStore(db),
  runner: createProcessSandboxRunner({ launcherIdentity: { uid: 1000, gid: 1000 } }),
  installRoot: '/data/agent-tools',
  policy: async (tenantId) => loadToolPolicy(tenantId),
  audit: (entry) => recordActivity(entry),
})

await runtime.register(tenantId, defineAgentTool({
  id: 'ripgrep',
  name: 'ripgrep',
  description: 'Fast recursive search across files.',
  sourceKind: 'npm-package',
  risk: 'low',
  packageName: '@microsoft/ripgrep-prebuilt',
  packageVersion: '0.1.2',
  capabilities: ['search'],
  bins: [{ name: 'rg', bin: 'rg', healthCheckArgs: ['--version'] }],
  limits: { cpuSeconds: 30, processes: 32 },
}))

const result = await runtime.execute({
  tenantId,
  toolId: 'ripgrep',
  command: 'rg',
  argv: ['--json', 'invoice'],
  workdir: agentHomePath,
  installIfMissing: true,
  actor: agentId,
})
// 'ran' | 'blocked' (a person was asked) | 'denied' | 'unavailable'
```

The catalogue itself is the application's, not this package's — which tools a
business trusts is a product decision, and pinned versions belong where they can
be reviewed and updated.

## Persistence

The `AgentToolStore` port has two adapters: `createMemoryAgentToolStore()` for
tests and single-process tooling, and `createDrizzleAgentToolStore(db)` over the
tables in `@appkitjs/agent-tools/schema`. Every method is tenant-scoped; pass a
tenant-bound `db` from `@appkitjs/db` so row-level security is the outer boundary.

Arguments reach the executable directly — there is no shell to quote for — so
the runtime rejects only what cannot survive an `execve` and leaves the sandbox
to be the actual boundary.
