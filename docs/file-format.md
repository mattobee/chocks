# File format

Every feature is a markdown file with YAML frontmatter, stored under `.chocks/`. This page covers every field, its limits and how invalid files are handled.

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

Every feature directory must contain `index.chocks.md`. A directory without one is invalid, as is `index.chocks.md` directly under `.chocks/`. Don't create both `<slug>.chocks.md` and `<slug>/` for the same feature.

Invalid entries are skipped, the rest of the tree still loads, and the problem is printed in the terminal.

Adding a first child changes a leaf into directory form. Removing its last child leaves directory form in place.

## A feature file

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

The markdown body is the description. Everything is editable by hand, and the running UI picks up changes immediately.

A feature's id is its path. There's no `parent` field that can disagree with the filesystem, and moving or retitling a feature is a rename. Links to a feature keep working after a move, because they resolve on a `uid` generated once per feature.

`uid` and `sort` are written by chocks. Leave them out of a hand-written file and chocks fills them in the next time it runs.

## Limits

Features saved through chocks allow:

- titles up to 300 characters
- 100 tags of up to 50 characters each
- descriptions up to 10,000 characters
- 20 `links` entries and 20 `code` entries

A hand-written file with more than 20 `links` or `code` entries opens with the first 20. An API write over the limit is rejected.

## `status`

One of `planned`, `pre-release`, `released`, `deprecated` or `dropped`, unless `.chocks/config.yaml` defines a different set.

## `importance`

`high`, `normal` or `low`.

A feature without the key inherits the nearest ancestor's importance, falling back to normal at the root. An explicit value wins, including `normal`, which stops inheritance. Unrecognised values are treated as absent.

The feature page shows the effective importance and names its source when inherited. Importance is read-only in the UI, so change it by editing the file.

## `links`

An ordered list of places to click. Each entry needs a `url`.

- HTTP, HTTPS and protocol-relative URLs are clickable.
- Repo-relative paths and other schemes render as plain text, because chocks does not serve files from the repo.
- An optional `label` replaces a clickable URL as the link text. For a non-clickable entry, the label appears alongside the raw value so the target is not hidden.
- An optional `type` adds an icon for `docs`, `issue`, `pr`, `design` or `spec`. Anything else gets the generic link icon and is not corrected or dropped.

Links are read-only in the UI, so editing one is a hand edit.

## `code`

A separate list claiming where a feature is implemented. Each entry needs a `path`, which is a repo-relative glob.

An optional `kind` is one of `code`, `test` or `flag` and defaults to `code`. An unrecognised `kind` falls back to the default.

The feature page shows how many files each `path` currently matches. Zero matches is shown as a broken claim. A `flag` entry has no path to check, so it's skipped.

Next to each entry is when its matched files last changed, against when the feature file itself last changed. That comparison is the drift signal: a `code` entry that moved on after the plan did is worth a second look. Both dates come from git. With no repo, no git or nothing committed, there's nothing to show.

`code` is read-only in the UI, and nothing fails a build over a stale entry.

## Older layouts

On startup, chocks migrates the old sibling file and directory layout to index files and renames remaining `*.feature.md` files to `*.chocks.md`. Clean git repositories use `git mv`. Other trees use filesystem moves.
