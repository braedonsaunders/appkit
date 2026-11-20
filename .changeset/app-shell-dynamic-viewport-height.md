---
"@braedonsaunders/appkit-ui": patch
---

Use dynamic viewport height (`100dvh` via `@supports (height: 100dvh)` with a `100vh` fallback) on `AppShell`, full-height `Dialog` panels, and mobile `SearchSelect` sheets so mobile browser toolbars (such as Firefox for Android's address bar) no longer hide `MobileTabBar` or clip overlays below the visible viewport.
