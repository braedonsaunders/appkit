# @braedonsaunders/appkit-remote-sessions

## 0.1.1

### Patch Changes

- adab5f2: Make durable, non-PTY terminal transcripts visually scannable with semantic ANSI for prompts,
  shell commands, stream kinds, and status while preserving provider-supplied ANSI and reader scroll.

## 0.1.0

### Minor Changes

- ed9b907: Extract provider-neutral remote computer and terminal sessions with fenced leases, append-only events, one-time viewer grants, cancellation, terminal commands, programmatic RDP/VNC control, React remote viewing, and a read-only xterm.js terminal surface with ANSI output, terminal-native scrollback, reader-respecting output follow behavior, host-owned header controls, and provider conformance.

## Unreleased

- Add RDP/VNC remote desktop support, protocol session leasing, and a remote terminal model.
- Adds provider-neutral sessions, fenced leases, immutable events, one-time grants, memory persistence, direct terminal and GUI control, React viewer, and provider conformance.
