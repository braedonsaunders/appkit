---
'@braedonsaunders/appkit-pdf': patch
---

Export the `ContentBox` type. `ComposePart.contentBoxes` shipped without it, so
consumers could pass boxes but not name their type.
