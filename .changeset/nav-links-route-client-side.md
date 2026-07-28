---
'@appkit/ui': patch
---

Make the navigation primitives honor `UiLinkProvider`. `TopNav`, `SidebarNav`,
and `MobileTabBar` each carried their own `defaultLink` that rendered a raw
`<a href>`, so an app that injected a router link at the root still full-reloaded
the document on every nav click — tearing down the router, discarding client
state, and skipping the `PageTransition` route animation entirely. Only
`SettingsLayout` resolved through `UiLink`.

The four copies are replaced by a single `defaultLinkRender` exported from
`link-context`, which resolves through `UiLink` and still falls back to a plain
`<a>` when no provider is present. `LinkRender` now lives beside it and is
re-exported from `settings-layout`, so the public type path is unchanged. Apps
passing an explicit `linkRender` are unaffected.
