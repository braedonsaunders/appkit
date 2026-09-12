---
'@braedonsaunders/appkit-ai': patch
---

Two parts whose fields differ can no longer produce the same transcript signature.

The signature that decides whether a host transcript has moved joined each part's fields with a space, and a value holding whitespace can absorb that separator: a status of `ok ` beside a tool call id of `c1` spaces-joins to exactly what a status of `ok` beside ` c1` does. Two different parts compared equal, and a real change was read as "the transcript did not move" — the panel sat on a stale snapshot.

The fields are now joined with a NUL, which no string value can carry, so distinct field tuples always produce distinct signatures.
