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

## Commits

Conventional Commits (`feat:`, `fix:`, `docs:`, `build:`, ...). Imperative subject, no
full stop, under ~50 characters. Body only when the why isn't obvious from the diff. No
`Co-Authored-By` trailer.

## Pull requests

Open as draft. Keep the description short: what it does and why, in plain language, with
technical detail only where a reviewer would otherwise be confused.

## Keeping docs in sync

`README.md` documents user-facing behaviour (file format, statuses, CLI flags). If a
change alters any of that, update the README in the same PR, not as a follow-up.
