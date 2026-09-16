---
'@braedonsaunders/appkit-apps': minor
---

Add datasets — a data plane for an application's own working data, at `@braedonsaunders/appkit-apps/datasets`.

A sandboxed frontend can reach the host's records adapter, its authored backend, and whatever literal it shipped with. Data the app's *author* produced — a CSV a script wrote, rows a job computed — had nowhere to live, so authors pasted snapshots into source and hand-maintained them.

A dataset is named, typed rows stored in the app's existing storage namespace, served through `datasetRecords()` as `dataset.<name>` (and `datasets` for the index). The frontend reads it with the `records.list` API it already uses, so this adds no bridge method and no new sandbox surface. `parseDatasetContent` accepts CSV, TSV, JSON, and NDJSON; `putDataset` replaces or appends with key-column correction. A dataset may carry a producer — the command that regenerates it — with `datasetIsStale` and `claimDatasetRefresh` so a host can refresh it without a round trip through the author.
