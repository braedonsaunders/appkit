# @braedonsaunders/appkit-apps

## 3.2.0

### Minor Changes

- 1350d09: Add datasets — a data plane for an application's own working data, at `@braedonsaunders/appkit-apps/datasets`.

  A sandboxed frontend can reach the host's records adapter, its authored backend, and whatever literal it shipped with. Data the app's _author_ produced — a CSV a script wrote, rows a job computed — had nowhere to live, so authors pasted snapshots into source and hand-maintained them.

  A dataset is named, typed rows stored in the app's existing storage namespace, served through `datasetRecords()` as `dataset.<name>` (and `datasets` for the index). The frontend reads it with the `records.list` API it already uses, so this adds no bridge method and no new sandbox surface. `parseDatasetContent` accepts CSV, TSV, JSON, and NDJSON; `putDataset` replaces or appends with key-column correction. A dataset may carry a producer — the command that regenerates it — with `datasetIsStale` and `claimDatasetRefresh` so a host can refresh it without a round trip through the author.

## 3.1.0

### Minor Changes

- ee93dc0: Add optional, accessible timestamps to completed assistant messages in `AgentPanel`.

  Make sandboxed app frontends inherit the host application theme automatically and announce live theme changes through the `appkit:themechange` browser event.

## 3.0.1

### Patch Changes

- 69fbb2a: Resolve standard document-relative frontend asset references when inlining opaque-origin app bundles, and let apps declare exact public data origins for separately granted backend requests.

## 3.0.0

### Patch Changes

- Updated dependencies [22722ea]
  - @braedonsaunders/appkit-ui@0.3.0

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
  - @braedonsaunders/appkit-endpoints@0.1.1
  - @braedonsaunders/appkit-ui@0.1.1
