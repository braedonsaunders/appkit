---
'@braedonsaunders/appkit-tokens': minor
'@braedonsaunders/appkit-ui': minor
'@braedonsaunders/appkit-dashboard': minor
---

Make the shells behave the same in every consumer, not only in the playground.

- **`.reveal` ships in `tokens.css`.** The page shells (`PageContainer`,
  `ListPageLayout`, `DetailPageLayout`, `WizardLayout`) apply `.reveal` to their
  canvas, but only the playground defined it. It now lives beside `.appkit-row`:
  visible by default, `@starting-style` entrance, `--reveal-delay` stagger, and
  no motion under `prefers-reduced-motion`.
- **Theme defaults without a flash.** `ThemeProvider` and `getThemeScript` take
  one `ThemeOptions` object — `{ storageKey, defaultTheme, enableSystem }` — so
  the pre-paint class always matches the hydrated theme. `defaultTheme` (default
  `'system'`) applies until the user picks a theme; `enableSystem: false` makes a
  light/dark-only app, and `ThemeToggle` then offers only light and dark.
  `getThemeScript(options)` replaces the positional `getThemeScript(storageKey)`
  form. The script is also exported from the React-free
  `@braedonsaunders/appkit-ui/theme-script` entry, so a static `index.html` (for
  example a Vite `transformIndexHtml` hook) can inline it at build time.
- **`PageHeader` actions wrap instead of overflowing.** The title keeps at least
  12rem; actions wrap onto their own row on narrow screens and wrap their own
  items when crowded. Pass actions as a fragment of controls.
- **`SettingsShell` is usable on phones.** Below `md` the fixed-width rail
  collapses into a horizontally scrolling section strip above the content that
  keeps the active section in view. It is the same DOM as the rail
  (`SettingsNav layout="responsive"`), so there are no duplicate controls.
- **`DashboardPanel` sizes to its content.** It no longer forces `h-full`, so it
  sits in stacks and CSS grids without stretching to the column height, and it
  can shrink inside grid tracks. Pass `fill` to take the parent's height.
  `DashboardGrid` cells now stretch their nodes to the cell themselves, so grid
  dashboards look the same as before.
- `Table` and its parts no longer carry `'use client'`; they have no
  interactivity and render as Server Components. The client-directive guidance
  for Vite and Rollup consumers is now in the orientation guide.
