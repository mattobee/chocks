# AGENTS.md

chocks is a dev tool that lives alongside your code rather than a service you sign into:
run it in a repo, get a feature-tree UI on localhost, backed by markdown files in
`.chocks/`. See `README.md` for what it does and the file format it reads and writes.

## Commands

```sh
pnpm install
pnpm dev:server   # API on :4321, watching src/
pnpm dev          # UI on :5173, proxying /api to it
pnpm check        # lint, format check, typecheck, unit tests — run this before finishing
pnpm test:e2e     # builds, then runs Playwright
pnpm build        # dist/ui (Vite) + dist/cli.mjs (tsdown)
```

`pnpm check` is what CI runs first. Run it after any change. Run `pnpm test:e2e` too if
the change touches UI behaviour, the CLI, or the store's on-disk format — it drives a
real browser against a throwaway git repo.

## Layout

- `src/lib` — pure, shared by server and UI: tree building, filtering, drag projection,
  sort keys. Unit tested, no filesystem or DOM.
- `src/store` — owns the `.chocks` file format and the filesystem.
- `src/server` — Hono API.
- `src/ui` — React, Tailwind, shadcn/ui on Base UI.
- `e2e` — Playwright specs.

## Code style

Enforced by `pnpm check` (oxlint + prettier + tsc), not by hand. Don't reformat code to
taste; if `pnpm check` is green, leave it. Locators in tests are role-based in both
Testing Library and Playwright — an accessible-name change should fail a test, that's the
point, don't loosen a locator to make a failure go away.

## Comments

Comment the why, not the what. A comment earns its place by recording a decision, a
constraint, or a trap that isn't visible in the code beside it. Anything the code already
says plainly comes out.

Keep them short. Two or three lines is the normal ceiling, and a doc comment running past
about six wants cutting rather than rewording. Say it once: don't state the point
abstractly and then again with an example, and don't spell out what a named function
alongside already proves.

Where the same reasoning applies in more than one file, write it out once and point at
that place from the others.

If a comment is explaining what the code does, rename things until it isn't needed.

## Commits

Conventional Commits (`feat:`, `fix:`, `docs:`, `build:`, ...). Imperative subject, no
full stop, under ~50 characters. Body only when the why isn't obvious from the diff. No
`Co-Authored-By` trailer.

## Pull requests

Open as draft. Keep the description short: what it does and why, in plain language, with
technical detail only where a reviewer would otherwise be confused.

Label any PR that changes a feature in `.chocks` with `chocks`, so the tree's own history
is separable from the code's.

## Keeping docs in sync

`README.md` documents user-facing behaviour (file format, statuses, CLI flags). If a
change alters any of that, update the README in the same PR, not as a follow-up.

## Releases

`CHANGELOG.md` is written by hand, in the release commit rather than per PR. Most changes
here are internal and shouldn't appear in it at all, so deciding what a user would notice
is a judgement call made once, with the whole release in view. Don't paper over the
omissions with a line like "general improvements". Each entry ends with a compare link to
the previous tag, which shows everything precisely for anyone who wants it.

To release: bump the version in `package.json`, add the matching `## <version>` section to
the changelog, commit both to `main`, then push a `v<version>` tag. The tag triggers the
release workflow, which reruns everything, refuses to publish if the tag is outside `main`
or disagrees with `package.json` and the changelog, publishes to npm, and opens a GitHub
release using that changelog section as the notes.

npm publishing uses the trusted publisher for `.github/workflows/release.yml`, scoped to
the `npm` GitHub environment. It needs no npm token; keep that publisher and environment
in sync if either name changes.
