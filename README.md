# chocks

Track planned and existing features as a nested tree, stored as files in your repo.

Like Storybook, chocks is a dev tool that lives alongside the code rather than a service
you sign into. Run it in a repo, get a UI on localhost, and your feature tree is a
directory of markdown files you commit, branch, diff and review like anything else.

```sh
pnpm add -D @mattobee/chocks
pnpm chocks
```

Published to npm. The source lives in a private repo, but the package itself is public,
so installing it needs no registry config and no token.

## Why files

The feature tree belongs next to the code that implements it.

- **The plan changes in the same pull request as the code.** A reviewer sees the feature
  move to `done` in the same diff that makes it true.
- **Branches work.** Sketch a feature tree on a spike branch and throw it away with the
  branch.
- **No account, no server, no sync.** Access control is having the repo checked out.
- **Nothing to lose.** Worst case, `.chocks` is a folder of markdown you can read in any
  editor.

## Layout

A feature is `<slug>.feature.md`. Its children live in a sibling `<slug>/` directory:

```
.chocks/
  authentication.feature.md
  authentication/
    oauth-providers.feature.md
    oauth-providers/
      github.feature.md
      google.feature.md
```

```markdown
---
title: OAuth providers
status: in-progress
tags:
  - api
---

Supports GitHub and Google. Needs a token refresh story before this is done.
```

The markdown body is the description, and everything is editable by hand: the running UI
picks up changes immediately. A feature's id is its path, so there's no `parent` field
that can disagree with the filesystem, and moving or retitling a feature is just a rename.
Links keep working after a move, because they resolve on a `uid` generated once per
feature rather than on the path.

## Seeding a tree

A new install has no tree. The fastest way to fill one in is pointing a coding agent at
the repo and asking it to read the code for you.

```
Read this codebase and populate .chocks with a feature tree.

A feature is a capability someone outside the team would recognise, not a file, a
function or an internal system. Split down to individual actions where each has its own
lifecycle: creating, editing and deleting a thing usually ship at different times, so
`create-audit`, `edit-audit` and `delete-audit` belong under `audits/` as three features,
not one. Stop splitting once you'd be naming something no user or PM would ever refer to
separately, or that only exists because of how the code happens to be organised.

A feature is <slug>.feature.md; its children live in a sibling <slug>/ directory. For
each feature, write a title, a status guessed from whether it looks unbuilt,
half-finished or shipped, tags for cross-cutting concerns such as "api" or "billing", and
a couple of sentences describing it in the markdown body. Skip uid and sort: chocks fills
those in the first time it runs. For example:

---
title: OAuth providers
status: pre-release
tags:
  - api
---

Supports GitHub and Google. Needs a token refresh story before this is done.
```

Review the result before committing it. An agent can only see what's in the repo, so it
will get statuses wrong for anything still in your head and miss features that were
deliberately dropped. That's a starting point to edit, not a finished tree.

For a big or unfamiliar codebase, narrow the same prompt to one directory or one PR's
diff at a time rather than asking for the whole tree in one pass.

## Statuses

The defaults are a lifecycle, not a workflow: Idea, Planned, Pre-release, Released,
Deprecated, plus Dropped for something considered and rejected.

Each one describes where a feature is, not how much effort is going into it. That's
deliberate: "in progress" collides with every other state, since a released feature is
usually still being worked on. Activity is a separate axis, so use a tag for that instead.

Override them in `.chocks/config.yaml`:

```yaml
statuses:
  - id: idea
    label: Idea
    color: slate
  - id: shipped
    label: Shipped
    color: emerald
```

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

Tree view with expand/collapse, inline rename and status, drag to reorder and reparent,
and search and status/tag filters that prune the tree while keeping ancestors visible.
Every feature also has its own page at `/f/<slug>~<uid>`, showing its breadcrumb trail,
description, sub-features and git history, the commits that touched that file. chocks has
no revision model of its own on purpose: the repo already records who changed what and
why, usually in the same commit as the code the feature describes.

## Development

```sh
pnpm install
pnpm dev:server   # API on :4321, watching src/
pnpm dev          # UI on :5173, proxying /api to it
pnpm check        # oxlint, prettier, tsc, vitest
pnpm test:e2e     # builds, then runs Playwright
pnpm build        # dist/ui (Vite) + dist/cli.mjs (tsdown)
```

`src/lib` is pure and shared by both sides: tree building, filtering, drag projection and
sort keys. `src/store` owns the file format and the filesystem. `src/server` is Hono.
`src/ui` is React, Tailwind and shadcn/ui on Base UI.
