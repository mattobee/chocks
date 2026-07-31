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

`status` is one of `planned`, `in-progress`, `done`, `dropped`. The markdown body is the
description. Everything is editable by hand — the running UI picks up changes immediately.

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

Editing a `.md` file in your editor updates the open UI, and vice versa.

## Development

```sh
pnpm install
pnpm dev:server   # API on :4321, watching src/
pnpm dev          # UI on :5173, proxying /api to it
pnpm check        # oxlint, prettier, tsc, vitest
pnpm build        # dist/ui (Vite) + dist/cli.mjs (tsdown)
```

`src/lib` is pure and shared by both sides — tree building, filtering, drag projection and
sort keys, all unit tested. `src/store` owns the file format and the filesystem.
`src/server` is Hono. `src/ui` is React, Tailwind and shadcn/ui on Base UI.

## Not doing

No accounts, no hosted version, no sync. If you want to publish a tree, the natural next
step is a static export — but git already handles sharing.
