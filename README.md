# chocks

Track planned and existing features as a nested tree — stored as files in your repo.

Like Storybook, chocks is a dev tool that lives alongside the code rather than a service
you sign into. Run it in a repo, get a UI on localhost, and your feature tree is a
directory of markdown files that you commit, branch, diff and review like anything else.

```sh
npx chocks
```

## Why files

Because the feature tree belongs next to the code that implements it.

- **The plan changes in the same pull request as the code.** A reviewer sees the feature
  move to `done` in the same diff that makes it true.
- **Branches work.** Sketch a feature tree on a spike branch; throw it away with the branch.
- **No account, no server, no sync.** Access control is having the repo checked out.
- **Nothing to lose.** Worst case, `.chocks` is a folder of markdown you can read in any
  editor.

## Layout

A feature is `<slug>.feature.md`. Its children live in a sibling `<slug>/` directory.

```
.chocks/
  README.md                       <- ignored, not a feature
  authentication.feature.md
  authentication/
    oauth-providers.feature.md
    oauth-providers/
      github.feature.md
      google.feature.md
  feature-tree.feature.md
```

Only files ending `.feature.md` are features — the same trick as Storybook's
`.stories.tsx`. Anything else in the directory is left alone, so you can keep a README or
scratch notes in there. A markdown file without the suffix is reported at startup rather
than silently ignored, in case you mistyped it.

```markdown
---
title: OAuth providers
status: in-progress
tags:
  - api
sort: a1
uid: a1b2c3d4e5
---

Supports GitHub and Google. Needs a token refresh story before this is done.
```

The markdown body is the description. Everything is editable by hand — the running UI
picks up changes immediately.

`uid` is generated once and never changes. It is what makes a link keep working after the
feature is renamed or moved; hand-written files get one on next startup.

### Two properties this buys

**A feature's id is its path.** `authentication/oauth-providers/github` — so the parent is
just the dirname. There is no `parent` field that can disagree with the filesystem, and a
cycle is literally unrepresentable.

**Moving or retitling is a rename.** Dragging a feature to a new parent moves its file, and
editing its title re-slugs it, so the directory never drifts from what the UI shows. git
records both as exactly what they are:

```
R  .chocks/authentication/oauth-providers.feature.md -> .chocks/oauth-providers.feature.md
R  .chocks/authentication/oauth-providers/github.feature.md -> .chocks/oauth-providers/github.feature.md
```

Links survive it, because URLs are `/f/<slug>~<uid>` and resolve on the uid.

Ordering uses fractional index keys, so reordering rewrites one key in one file. Two
people reordering different parts of the tree on different branches merge cleanly instead
of fighting over renumbered siblings.

## Statuses

The defaults are a lifecycle, not a workflow:

**Idea** → **Planned** → **Pre-release** → **Released** → **Deprecated**, plus **Dropped**
for something considered and rejected.

Every one of those describes _where a feature is_, never how much effort is going into it.
That is deliberate: "in progress" collides with every other state, because a released
feature is usually still being worked on. Activity is a separate axis — use a tag.

Override them in `.chocks/config.yaml`:

```yaml
statuses:
  - id: idea
    label: Idea
    color: slate
  - id: shipped
    label: Shipped
    color: emerald
  - discovery # shorthand: label and colour are derived
```

Order is the lifecycle order, and drives the filter bar and the status dropdown. Colours:
`slate`, `blue`, `amber`, `emerald`, `orange`, `rose`, `violet`, `muted`.

A status the config does not define is **preserved, not corrected** — it renders in a
neutral dashed style. A branch with different config, or a hand-typed value, must survive
a round trip rather than being silently rewritten. Malformed config falls back to the
defaults and reports the problem instead of refusing to start.

## Usage

```
npx chocks [options]

  -d, --dir <path>    Feature directory (default: .chocks next to the repo root)
  -p, --port <port>   Port to listen on (default: 4321)
      --host <host>   Address to bind (default: 127.0.0.1)
      --no-open       Do not open a browser
  -h, --help          Show this message
```

It walks up from the working directory to find the repo root, creating `.chocks` on first
run. Binds to loopback unless you pass `--host`.

## What the UI does

Tree view with expand/collapse; inline rename and status; drag to reorder and reparent;
search and status/tag filters that prune the tree while keeping ancestors visible, with
the filter state in the URL so a filtered view is shareable. Every feature also has its
own page at `/f/<slug>~<uid>`, showing its breadcrumb trail, description and sub-features.

Editing a feature file in your editor updates the open UI, and vice versa.

Each feature page also shows its **git history** — the commits that touched that file,
read with `--follow` so the trail survives every rename and reparent. chocks has no
revision model of its own on purpose: the repo already records who changed what and why,
usually in the same commit as the code the feature describes.

## Changing a feature that is already released

Two cases that look alike but are not:

- **A new capability** on something released is a _child feature_ with its own lifecycle.
  The parent stays Released, because it is; the child sits at Pre-release. The hierarchy
  already says this, so no new concepts are needed.
- **Anything else** — reworking internals, correcting a description, changing scope — is
  just an edit. The status does not move, because the feature's lifecycle position has not
  changed. `git log` carries the why.

If you want to flag that something is actively being worked on, that is the activity axis,
not the lifecycle one: use a tag.

## Development

```sh
pnpm install
pnpm dev:server   # API on :4321, watching src/
pnpm dev          # UI on :5173, proxying /api to it
pnpm check        # oxlint, prettier, tsc, vitest
pnpm test:e2e     # builds, then runs Playwright
pnpm build        # dist/ui (Vite) + dist/cli.mjs (tsdown)
```

Tests come in three layers. `vitest` runs two projects: the store, server and pure logic in
node, and the components in jsdom with Testing Library. Playwright drives a real browser
against a throwaway git repo, so a drag can be checked by looking at what changed on disk.
One suite packs the tarball, installs it and drives that, which is the only layer that
catches anything depending on install layout.

Locators are role-based throughout, in both layers. Break an accessible name and the tests
fail, which is the point. axe runs on the main screens as a floor, with explicit
assertions on top for the things a scanner doesn't know to look for.

`src/lib` is pure and shared by both sides — tree building, filtering, drag projection and
sort keys, all unit tested. `src/store` owns the file format and the filesystem.
`src/server` is Hono. `src/ui` is React, Tailwind and shadcn/ui on Base UI.

## Not doing

No accounts, no hosted version, no sync. If you want to publish a tree, the natural next
step is a static export — but git already handles sharing.
