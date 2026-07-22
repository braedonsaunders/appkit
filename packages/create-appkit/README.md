# create-appkit

Create a production-ready Next.js application on AppKit's modular foundation.
The generated project includes the AppKit shell, semantic tokens, theme runtime,
routed-page transitions, and a working responsive home route. Optional feature
groups add only the packages your product needs.

```bash
pnpm create appkit my-app
```

Select feature groups non-interactively:

```bash
pnpm create appkit operations --features forms,tenancy,workflows --yes
```

Available groups are `ai`, `analytics`, `communications`, `customization`,
`documents`, `extensions`, `forms`, `integrations`, `platform`, `tenancy`, and `workflows`.
Use `--package-manager` to select pnpm, npm, Yarn, or Bun; `--no-install` and
`--no-git` are available for automation.

The command refuses to overwrite a non-empty directory. Generated AppKit
dependencies use the current npm release, so the scaffold does not become tied
to the CLI's own release version.

See the [AppKit package guide](https://github.com/braedonsaunders/appkit#what-you-can-build-with)
for the contracts and optional adapters provided by each package.
