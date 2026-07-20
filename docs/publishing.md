# Publishing AppKit

AppKit is developed as a source-linked pnpm workspace and distributed as clean,
compiled npm packages. Those are two views of the same package—there is no
second hand-maintained publish manifest or release branch.

## Artifact contract

Each package runs the shared `scripts/build-package.mjs` compiler. It creates a
`dist` publish directory containing:

- ESM JavaScript with Node-compatible relative file extensions;
- TypeScript declarations, declaration maps, and source maps;
- exported CSS and feature-owned Drizzle migrations;
- a transformed package manifest with conditional `types`, `import`, and
  `default` exports;
- normal semver ranges in place of local `workspace:*` dependencies; and
- the package README and repository license.

Tests, TypeScript sources, development dependencies, workspace scripts, and
local publish configuration are excluded. The workspace manifest remains
source-oriented for local development; pnpm's `publishConfig.directory` tells
publication tooling to publish `dist`.

Run the artifact verification locally:

```bash
pnpm build:packages
pnpm test:packages
pnpm test:consumers
```

`test:packages` creates real tarballs and verifies every declared export and
required asset. `test:consumers` installs those tarballs into fresh Node/React
and generated Next.js projects, executes runtime/type checks, and completes a
production Next build. Artifacts live under ignored `.artifacts/` only for the
duration of local inspection.

## Version and release flow

Every publishable change includes a file under `.changeset/`. On `main`, the
release workflow uses Changesets to maintain one version PR. Merging that PR
causes the same workflow to:

1. install from the frozen lockfile;
2. run the complete `pnpm validate` gate;
3. rebuild and repack every package;
4. publish changed packages to npm with provenance; and
5. create the corresponding Git tags and GitHub releases.

Repository setup requires an npm automation/granular access token saved as the
`NPM_TOKEN` GitHub Actions secret with publish access to the `@appkit` scope and
the unscoped `create-appkit` package. The workflow grants GitHub's OIDC
`id-token: write` permission for npm provenance and uses the built-in
`GITHUB_TOKEN` for release pull requests and tags.

Do not run `npm publish` from a package source directory. For an intentional
manual release, use the same checked path as automation:

```bash
pnpm validate
pnpm changeset
pnpm version-packages
pnpm release
```

Commit the versioning output before `pnpm release`; Changesets expects the
release commit to be the tagged state.

## Adding or changing a package

Run `pnpm sync:package-metadata` after adding a package. The boundary gate
enforces the shared compiler, repository metadata, license, public `dist`
publication, and provenance setting across every package. Add exports only to
the source manifest—the build derives the corresponding runtime and type
targets and fails if any target is missing.

If a feature owns persistence, keep its migrations in the package's `drizzle`
directory and list that directory in the source manifest's `files` array. The
shared build copies migrations verbatim and the existing architecture gate
requires them for persistence-owning packages.
