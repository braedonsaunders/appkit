---
'@braedonsaunders/appkit-ai': patch
---

Stop typing lag on long threads: the composer draft input now lives in a memoed component that owns its own state, so a keystroke re-renders only the composer instead of every transcript row. Transcript rows are memoed and receive a stable submit callback, so streaming a turn re-renders only the tail row.
