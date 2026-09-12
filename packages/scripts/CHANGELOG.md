# @braedonsaunders/appkit-scripts

## 3.0.0

### Patch Changes

- Updated dependencies [22722ea]
  - @braedonsaunders/appkit-ui@0.3.0

## 2.0.1

### Patch Changes

- e88f447: The post-publish registry audit now waits for npm propagation instead of failing the release.

  It runs immediately after `npm publish`, and a version is not queryable the instant publish returns. Twice a release published every package successfully and then failed its own verification with `E404` on the package it had just pushed — reporting a healthy release as a broken one, which teaches everyone to ignore a red Release run.

  A 404 there means "not yet" far more often than "never", so absence is retried for up to two minutes. Anything else — an auth failure, a malformed range, a refused connection — still fails on the first attempt, because waiting cannot fix it.

## 2.0.0

### Patch Changes

- Updated dependencies [22e968a]
- Updated dependencies [9f04661]
  - @braedonsaunders/appkit-ui@0.2.0

## 1.0.0

### Patch Changes

- Updated dependencies [3ae036d]
- Updated dependencies [3ab6056]
- Updated dependencies [1319bfb]
- Updated dependencies [1319bfb]
  - @braedonsaunders/appkit-db@0.2.0
  - @braedonsaunders/appkit-ui@0.1.1
