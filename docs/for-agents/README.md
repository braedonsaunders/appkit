# for-agents

First-party docs so an AI agent (or a new engineer) becomes productive on appkit
immediately. Start at the repo root [`AGENTS.md`](../../AGENTS.md), then:

- **[orientation.md](orientation.md)** — the design system, the full primitive
  index, and the composition patterns. Read it and you can build a
  suite-consistent screen.
- **[building-applications.md](building-applications.md)** — the generalized,
  app-agnostic rules for building any application on this foundation (distilled
  from the openbooks + beaconhs `AGENTS.md`). Apps built on appkit adopt these
  and add only their domain-specific rules.

The living reference for everything documented here is `apps/playground` — a
runnable app that exercises every primitive plus an `/admin` area. When a doc and
the code disagree, the code (and the playground) win — fix the doc.
