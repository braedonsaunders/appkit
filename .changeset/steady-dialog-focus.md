---
'@appkit/ui': patch
---

Keep dialog and drawer focus stable while controlled form fields rerender.

Inline close callbacks no longer restart overlay focus management on every
keystroke, and explicit `autoFocus` fields take precedence over corner close
buttons when an overlay first opens.
