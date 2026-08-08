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

- **The plan changes in the same pull request as the code.** A reviewer sees the feature move to `released` in the same diff that makes it true.
- **Branches work.** Sketch a feature tree on a spike branch and throw it away with the branch.
- **No account, no server, no sync.** Access control is having the repo checked out.
- **Agents can read it.** `chocks context` prints the whole tree in one go, so a coding agent starts a session knowing what the product does and what state each part is in, rather than inferring it from the code.
- **Nothing to lose.** Worst case, `.chocks` is a folder of markdown you can read in any editor.

A tree lives in one repo. For a product spread across several, you can keep a tree in each, or put the whole product in one dedicated chocks repo. One tree gives you one map of the product. The cost is that the plan no longer changes in the same pull request as the code, which is what stops a tree going stale. I'd keep a tree per repo, but that's a preference rather than a rule.

## Statuses

The defaults are a lifecycle, not a workflow: Planned, Pre-release, Released, Deprecated, plus Dropped for something considered and rejected.

Each one says where a feature is, not how much effort is going into it. That's deliberate. "In progress" collides with every other state, since a released feature is usually still being worked on. Activity is a separate axis, so use a tag for that instead.

It's also the difference between chocks and an issue tracker in markdown. A ticket describes work that finishes and goes away. A status describes the product, which is still there afterwards.

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

### What doesn't belong in the tree

I moved this repo's own ideas and not-yet-started features out of chocks and into GitHub issues. What stayed is everything that's a statement about what shipped: released, pre-release, deprecated and dropped.

That's the boundary I'd suggest. Planned is for something you've decided to build and want visible in the tree, not for a backlog of maybes. If you're reordering the tree to work out what to do next, that belongs in your issue tracker instead.

It's a judgement call rather than anything the tool enforces, so ignore it if your team works differently.

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

Every feature directory must contain `index.chocks.md`. A directory without one is invalid, as is `index.chocks.md` directly under `.chocks/`. Don't create both `<slug>.chocks.md` and `<slug>/` for the same feature. Invalid entries are skipped, the rest of the tree still loads, and the problem is printed in the terminal. Adding a first child automatically changes a leaf into directory form. Removing its last child leaves directory form in place.

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
  - label: Original proposal
    url: docs/notifications.md
code:
  - path: src/notifications/daily-digest.ts
  - path: src/notifications/daily-digest.test.ts
    kind: test
  - path: daily-digest-send-time
    kind: flag
---

Sends once a day with everything you missed. Still behind a flag while the send time is settled.
```

The markdown body is the description, and everything is editable by hand: the running UI picks up changes immediately. Features saved through chocks allow titles up to 300 characters, 100 tags of up to 50 characters each, and descriptions up to 10,000 characters. A feature's id is its path, so there's no `parent` field that can disagree with the filesystem, and moving or retitling a feature is just a rename. Links keep working after a move, because they resolve on a `uid` generated once per feature rather than on the path.

`importance` is `high`, `normal` or `low`. A feature without the key inherits the nearest ancestor's importance, falling back to normal at the root. An explicit value wins, including `normal`, which stops inheritance. Unrecognised values are treated as absent. The feature page shows the effective importance and names its source when inherited. Importance is read-only in the UI, so change it by editing the file.

`links` is an ordered list of up to 20 objects. Each needs a `url`. HTTP, HTTPS and protocol-relative URLs are clickable; repo-relative paths and other schemes render as plain text because chocks does not serve files from the repo. An optional `label` replaces a clickable URL as the link text. For non-clickable entries, the label appears alongside the raw value in muted monospace text so the file or target is not hidden. An optional `type` adds an icon for `docs`, `issue`, `pr`, `design` or `spec`; anything else gets the generic link icon without being corrected or dropped. A hand-written file with more than 20 entries opens with the first 20, while an API write over the limit is rejected. Links are read-only in the UI for now, so editing one is a hand edit.

`code` is a separate, similarly shaped list claiming where a feature is implemented. Where a link is somewhere to click, a `code` entry is a repo-relative glob, and each needs a `path`. An optional `kind` is one of `code`, `test` or `flag` and defaults to `code`, with an unrecognised `kind` falling back to the default rather than being dropped. It's capped at 20 entries the same way `links` is.

The feature page shows how many files each `path` currently matches, read fresh from disk on that page rather than folded into the tree scan, so opening the tree stays fast. Zero matches is shown as a broken claim rather than a neutral fact, since a glob that finds nothing and one that finds plenty would otherwise look identical. A `flag` entry has no path to check, so it's skipped rather than reported as zero.

Next to each entry is when its matched files last changed, against when the feature file itself last changed. That comparison is the drift signal: a `code` entry that moved on after the plan did is worth a second look. Both dates come straight from git, and degrade the same way the feature page's own History section does: no repo, no git, or nothing committed yet all mean there's nothing to show rather than an error. Beyond that, `code` is read-only in the UI: nothing yet fails a build over a stale entry, which is what a future `chocks audit` would do.

## Seeding a tree

A new install has no tree. The fastest way to fill one in is pointing a coding agent at the repo and asking it to read the code for you.

```
Read this codebase and populate .chocks with a feature tree.

A feature is a capability someone outside the team would recognise, not a file, a function or an internal system. Split down to individual actions where each has its own lifecycle: creating, editing and deleting a thing usually ship at different times, so `create-invoice`, `edit-invoice` and `delete-invoice` belong under `invoices/` as three features, not one. Stop splitting once you'd be naming something no user or PM would ever refer to separately, or that only exists because of how the code happens to be organised.

A leaf feature is <slug>.chocks.md. A feature with children is a <slug>/ directory with its own content in <slug>/index.chocks.md and its children alongside that index. Never create both <slug>.chocks.md and <slug>/ for one feature, and never create a feature directory without index.chocks.md.

For each feature, write a title, a status, tags for cross-cutting concerns such as "api" or "billing", and a couple of sentences describing it in the markdown body. The status must be one of planned, pre-release, released, deprecated or dropped, unless .chocks/config.yaml defines a different set, in which case use those ids exactly. Use released for something that looks fully built, and pre-release for something still missing pieces. Add a `links` list when the feature has a URL you can point to, but only then: a made-up or guessed URL is worse than none. Add a `code` list of the paths that implement it, since you're already reading them to write the description.

Only add features you can see in the code. Leave out anything referenced but not built, like a TODO or an empty route. You can't tell from the code whether it's planned or abandoned, and a wrong guess is harder to notice later than a gap.

Skip uid and sort. chocks fills those in the first time it runs. For example:

---
title: Daily digest email
status: pre-release
tags:
  - notifications
---

Sends once a day with everything you missed. Still behind a flag while the send time is settled.
```

Review the result before committing it. An agent can only see what's in the repo, so it will get statuses wrong for anything still in your head and miss features that were deliberately dropped. That's a starting point to edit, not a finished tree.

If chocks is running while the agent works, it backfills uids for the new files as they land, with or without a tab open. If it isn't, it does the same the next time it starts.

For a big or unfamiliar codebase, narrow the same prompt to one directory or one PR's diff at a time rather than asking for the whole tree in one pass.

## Agent context

`chocks context` prints the whole feature tree as JSON Lines, in tree order. Each line has one feature's path, title, status, tags, links, code and a summary taken from the first paragraph of its description. Effective high or low importance is included when present; normal is omitted. It writes only to stdout and does not start the server or open a browser.

Add this to `AGENTS.md` or `CLAUDE.md` so coding agents use the product plan instead of inferring it from the code:

```markdown
## Product context

At the start of a session, run `npx chocks context` and use its feature tree as context
for your product's scope, status and terminology.
```

Pass `--dir` when the feature directory is somewhere other than `.chocks`:

```sh
npx chocks context --dir docs/features
```

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

It walks up from the working directory to find the repo root, creating `.chocks` on first run. Before binding, it migrates the old sibling file and directory layout to index files and renames remaining `*.feature.md` files to `*.chocks.md`. Clean git repositories use `git mv`; other trees use filesystem moves. Symbolic links inside the feature directory are refused so reads and writes cannot escape it. Binds to loopback unless you pass `--host`. Requests for any other host are rejected, and browser changes must come from the same origin.

## What the UI does

A persistent sidebar shows the whole tree next to whatever feature you're viewing: expand/collapse, drag to reorder and reparent, a search box, and a filter menu for status and tags that prune the tree while keeping ancestors visible. A button in the sidebar starts a new top-level feature. Every feature also has its own page at `/f/<slug>~<uid>`, showing its breadcrumb trail, description, status, sub-features and git history. The history marks when the feature file was created, links commits to recognised repository hosts, and shows the first and last releases that include it. Rename, status and description are all edited there, not on the row in the tree. Chocks has no revision model of its own on purpose: the repo already records who changed what and why, usually in the same commit as the code the feature describes.

`Cmd+Z` undoes the last change, `Cmd+Shift+Z` redoes it, and both work several steps back. That is a safety net for the edit you regret a second later, not a history: it survives a refresh but goes when you close the tab, and nothing extra is written to `.chocks`. Undoing a delete puts the whole subtree back with the same uids, so links to it keep working. If a feature has changed on disk since, the undo is refused rather than applied over the top.

## Development

```sh
pnpm install
pnpm dev:server   # API on :2457, watching src/
pnpm dev          # UI on :5173, proxying /api to it
pnpm check        # oxlint, prettier, tsc, vitest
pnpm test:e2e     # builds, then runs Playwright
pnpm build        # dist/ui (Vite) + dist/cli.mjs (tsdown)
```

`dev` has no backend of its own: it just proxies `/api` to :2457, so `dev:server` needs to be running too, in a second terminal.

`src/lib` is pure and shared by both sides: tree building, filtering, drag projection and sort keys. `src/store` owns the file format and the filesystem. `src/server` is Hono. `src/ui` is React, Tailwind and shadcn/ui on Base UI.
