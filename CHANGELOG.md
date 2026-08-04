# Changelog

What changed for people using Chocks. Internal tidying, dependency bumps and documentation
don't appear here.

Releases before 0.1.3 predate this file.

## 0.6.0

### Added

- `chocks context` prints the feature tree as JSON Lines, so coding agents can read its product scope, status, and terminology without crawling `.chocks`.
- A badge shows in the header next to the repo name whenever any feature in the tree has uncommitted changes. The badge on a feature's own history page uses the same styling.

### Changed

- Parent features now live in one directory with their children, using `index.chocks.md` for the parent's content. Existing trees migrate automatically the first time Chocks 0.6.0 runs. That migration is one way: once it has run, 0.5.0 and earlier can't read the tree, so don't roll back to an older version after upgrading.
- The per-feature tag limit is now 100 (was 20).

[Full changes](https://github.com/mattobee/chocks/compare/v0.5.0...v0.6.0)

## 0.5.0

### Added

- A feature's title, tags, and description now have length limits: 300 characters for the
  title, 20 tags of up to 50 characters each, 10,000 for the description. They're enforced
  wherever a feature is created or edited.

### Changed

- Ideas are no longer included in the default status set, so new trees start with active,
  done, and backlog.

### Fixed

- Git status now stays live in linked worktrees and submodules. It previously stopped
  updating there because their `.git` is a file, not a directory.
- The local server rejects requests with an unexpected `Host` header, and browser requests
  that create, edit, move, or delete a feature must come from the same origin. That closes
  a route for a malicious website to change your tree without you asking.
- A feature directory can no longer be a symbolic link, which could otherwise redirect
  Chocks reads or writes outside `.chocks`.
- Editing the same tree from more than one place at once (two tabs, or a tab and an agent)
  now queues the changes instead of one silently overwriting another. A change made
  outside Chocks while that's in flight is reported as a conflict rather than lost.
- A feature that disappears mid-scan is skipped instead of failing the whole scan. A move
  that fails partway through is rolled back instead of leaving the tree split across the
  old and new location.
- Malformed requests, such as invalid JSON or a reference to a parent that doesn't exist,
  get a clear error instead of an unhandled crash.
- Typing a new tag and dismissing the tag picker with Escape keeps that tag selected,
  instead of discarding it.

[Full changes](https://github.com/mattobee/chocks/compare/v0.4.0...v0.5.0)

## 0.4.0

### Changed

- Feature files are named `<slug>.chocks.md` rather than `<slug>.feature.md`. Rename any
  you already have: Chocks no longer reads the old suffix, and says so at startup, naming
  the files it skipped. The old name is Cucumber's Markdown with Gherkin spec, so a repo
  doing BDD had two unrelated meanings for one extension.
- Status and tag filters are multi-select dropdowns instead of toggle chips, so they no
  longer wrap into a wall of buttons once a tree has more than a handful of tags. Each
  shows a count when something is selected, and nothing selected still means "any".
- The tags field on the new/edit dialog is a combobox: type to filter existing tags, pick
  one, or create a new one, shown as removable chips.

### Added

- Files that appear while Chocks is running get their permanent id straight away whether
  or not a tab is open. Point an agent at your repo with Chocks running headless and you
  no longer have to restart it before committing.
- Search has its own clear button, and "Clear filters" resets the status and tag filters
  without touching the search text.

[Full changes](https://github.com/mattobee/chocks/compare/v0.3.0...v0.4.0)

## 0.3.0

### Added

- Feature title and description are text now, with an edit button next to them, instead
  of permanent input fields.
- Descriptions render as markdown: headings, links, lists, task lists and tables show as
  intended rather than as source.
- A refreshed visual style, with fully rounded buttons and controls throughout.

### Changed

- Renaming a feature from the tree row goes through Edit now; the row's own inline rename
  is gone.
- The new/edit dialog no longer has a description field. Set it from the feature page
  instead.
- The tree row's "Add child" action is now "Add sub-feature", matching the feature page's
  own wording.

### Fixed

- The status control on a tree row kept its keyboard focus ring, which a stray style
  override had reduced to nothing.
- The destructive button's text meets WCAG AA contrast in both light and dark mode.
- The error and not-found pages have a real heading.
- Clicking blank space in the description editor's button bar now focuses the field, the
  same as it already did for a single-line input.

[Full changes](https://github.com/mattobee/chocks/compare/v0.2.0...v0.3.0)

## 0.2.0

### Added

- `Cmd+Z` undoes the last change and `Cmd+Shift+Z` redoes it, several steps back. Undoing
  a delete puts the whole subtree back with the same uids, so links to it keep working.
  The stack survives a refresh and goes when you close the tab; nothing extra is written
  to `.chocks`.
- The footer shows which version of Chocks is running, linked to its release notes.

### Fixed

- Dragging a feature works on a tree seeded without sort keys, which previously failed
  with "Internal error". That covers any tree an agent wrote.
- Chocks starts and keeps running when a feature file or `config.yaml` cannot be written
  or read, reporting what it could not do rather than stopping.
- Errors say what went wrong instead of "Internal error".

[Full changes](https://github.com/mattobee/chocks/compare/v0.1.3...v0.2.0)

## 0.1.3

### Added

- Features seeded into `.chocks` while Chocks is running now get their permanent id
  straight away, so links to them work without a restart.

### Fixed

- Dragging a feature now lands at the indent level the preview showed.

[Full changes](https://github.com/mattobee/chocks/compare/v0.1.2...v0.1.3)
