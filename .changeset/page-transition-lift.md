---
'@appkit/ui': patch
---

Give the native page transition a real presence. The route handoff was tuned so
quietly (opacity 0.9 → 1 over a 1px lift) that navigation read as an instant
swap. It is now a lift-and-settle crossfade: the outgoing canvas clears on the
fast duration token while the incoming one rises 12px and settles from a 0.99
scale on `--duration-slow` / `--ease-out`. Exit stays shorter than entrance so
the snapshots overlap only briefly and text never ghosts against itself.

Durations and easings remain tokens, `prefers-reduced-motion` is still honored,
and the `PageTransition` contract is unchanged — consuming apps pick this up
with no code edits.
