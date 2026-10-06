# Chocks

Every feature of your product, from planned to deprecated, as a tree of markdown files in your repo.

Your issue tracker tracks work. Tickets close and disappear, and once they have, nothing tells you what the product does or what state each part of it is in. Chocks tracks that instead.

It's a dev tool, not a service you sign into. Run it in a repo, get a UI on localhost, and your feature tree is a directory of markdown files you commit, branch, diff and review like anything else.

```sh
pnpm add -D @mattobee/chocks
pnpm chocks
```

## Why files

The feature tree belongs next to the code that implements it.

- **It changes with the code.** A feature moves to `released` in the same pull request that ships it.
- **Branches work.** Sketch a feature tree on a spike branch and throw it away with the branch.
- **No account, no server, no sync.** Access control is having the repo checked out.
- **Agents can read it.** `chocks context` prints the whole tree in one go, so a coding agent starts a session knowing what the product does, what state each part is in and where each part lives in the code.
- **Nothing to lose.** Worst case, `.chocks` is a folder of markdown you can read in any editor.

A tree lives in one repo. For a product spread across several, I'd keep a tree in each, so the plan still changes in the same pull request as the code.

## Statuses

The defaults are a lifecycle, not a workflow: Planned, Pre-release, Released, Deprecated, plus Dropped for something considered and rejected.

Each one says where a feature is, not how much effort is going into it. "In progress" collides with every other state, since a released feature is usually still being worked on. Activity is a separate axis, so use a tag for that.

Planned is for something you've decided to build and want visible in the tree, not for a backlog of maybes. If you're reordering the tree to work out what to do next, that belongs in your issue tracker.

Override the defaults in `.chocks/config.yaml`:

```yaml
statuses:
  - id: idea
    label: Idea
    color: slate
  - id: shipped
    label: Shipped
    color: emerald
```

## Agent context

The tree doubles as a map for coding agents. Each feature says what it is, what state it's in and which files implement it, so an agent can go straight to the right part of the repo instead of exploring to find it.

Docs that explain how the code works go stale, and they repeat what an agent can read for itself. A feature tree holds what the code can't say: what the product is made of, what's deprecated or dropped, and what your team calls each part.

It's a map of the product, not of the architecture. Shared code that no single feature owns, like auth middleware or build tooling, won't appear unless a feature claims it.

`chocks context` prints the whole feature tree as JSON Lines, in tree order. Each line has one feature's path, title, status, tags, links, code and a summary taken from the first paragraph of its description.

Add this to `AGENTS.md` or `CLAUDE.md`:

```markdown
## Product context

At the start of a session, run `npx chocks context` and use its feature tree as context
for your product's scope, status and terminology. Use each feature's `code` paths to find
where it's implemented before searching the repo.
```

## Layout

A leaf feature is `<slug>.chocks.md`. A feature with children is a `<slug>/` directory containing `index.chocks.md` alongside those children:

```
.chocks/
  notifications/
    index.chocks.md
    email/
      index.chocks.md
      daily-digest.chocks.md
      instant-alerts.chocks.md
```

```markdown
---
title: Daily digest email
status: pre-release
importance: high
tags:
  - notifications
links:
  - label: Daily digest user docs
    url: https://docs.example.com/daily-digest
    type: docs
code:
  - path: src/notifications/daily-digest.ts
  - path: daily-digest-send-time
    kind: flag
---

Sends once a day with everything you missed. Still behind a flag while the send time is settled.
```

The markdown body is the description. A feature's id is its path, so moving or retitling a feature is a rename. Edit a file by hand and the running UI picks up the change.

- `importance` is `high`, `normal` or `low`, inherited from the nearest ancestor when absent.
- `links` are places to click: docs, issues, pull requests, designs and specs.
- `code` claims where the feature is implemented, as repo-relative globs. The feature page shows how many files each one matches and whether they've changed since the feature file did.

The [file format reference](docs/file-format.md) covers every field, its limits and how invalid files are handled.

## Seeding a tree

A new install has no tree. The fastest way to fill one in is to give a coding agent the [seeding prompt](docs/seed-prompt.md) and let it read the code for you.

Review the result before committing it. An agent can only see what's in the repo, so it will get statuses wrong for anything still in your head and miss features that were deliberately dropped.

For a big or unfamiliar codebase, narrow the prompt to one directory or one pull request's diff at a time.

## Usage

```
npx chocks [options]
npx chocks context [options]

  context             Print the feature tree as JSON Lines

  -d, --dir <path>    Feature directory (default: .chocks next to the repo root)
  -p, --port <port>   Port to listen on (default: 2457)
      --host <host>   Address to bind (default: 127.0.0.1)
      --no-open       Do not open a browser
  -h, --help          Show this message
```

It walks up from the working directory to find the repo root and creates `.chocks` on first run.

It binds to loopback unless you pass `--host`. Requests for any other host are rejected, browser changes must come from the same origin, and symbolic links inside the feature directory are refused.

## What the UI does

A sidebar shows the whole tree next to the feature you're viewing, with search and filters for status and tags. Each feature has its own page showing its description, status, sub-features, links, code and git history.

You can create, rename, reorder and delete features in the UI. `Cmd+Z` undoes the last change and `Cmd+Shift+Z` redoes it, until you close the tab.

History comes from git. Chocks has no revision model of its own, because the repo already records who changed what and why.

## Development

```sh
pnpm install
pnpm dev:server   # API on :2457, watching src/
pnpm dev          # UI on :5173, proxying /api to it
pnpm check        # oxlint, prettier, tsc, vitest
pnpm test:e2e     # builds, then runs Playwright
pnpm build        # dist/ui (Vite) + dist/cli.mjs (tsdown)
```

`dev` proxies `/api` to :2457, so run `dev:server` alongside it. [`AGENTS.md`](AGENTS.md) covers the code layout and conventions.
