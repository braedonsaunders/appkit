---
'@braedonsaunders/appkit-scripts': patch
---

The post-publish registry audit now waits for npm propagation instead of failing the release.

It runs immediately after `npm publish`, and a version is not queryable the instant publish returns. Twice a release published every package successfully and then failed its own verification with `E404` on the package it had just pushed — reporting a healthy release as a broken one, which teaches everyone to ignore a red Release run.

A 404 there means "not yet" far more often than "never", so absence is retried for up to two minutes. Anything else — an auth failure, a malformed range, a refused connection — still fails on the first attempt, because waiting cannot fix it.
