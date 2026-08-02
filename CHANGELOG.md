# Changelog

What changed for people using chocks. Internal tidying, dependency bumps and documentation
don't appear here.

Releases before 0.1.3 predate this file.

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
- The error and not-found pages have a real heading, so a screen reader has something to
  land on.
- Clicking blank space in the description editor's button bar now focuses the field, the
  same as it already did for a single-line input.

[Full changes](https://github.com/mattobee/chocks/compare/v0.2.0...v0.3.0)

## 0.2.0

### Added

- `Cmd+Z` undoes the last change and `Cmd+Shift+Z` redoes it, several steps back. Undoing
  a delete puts the whole subtree back with the same uids, so links to it keep working.
  The stack survives a refresh and goes when you close the tab; nothing extra is written
  to `.chocks`.
- The footer shows which version of chocks is running, linked to its release notes.

### Fixed

- Dragging a feature works on a tree seeded without sort keys, which previously failed
  with "Internal error". That covers any tree an agent wrote.
- chocks starts and keeps running when a feature file or `config.yaml` cannot be written
  or read, reporting what it could not do rather than stopping.
- Errors say what went wrong instead of "Internal error".

[Full changes](https://github.com/mattobee/chocks/compare/v0.1.3...v0.2.0)

## 0.1.3

### Added

- Features seeded into `.chocks` while chocks is running now get their permanent id
  straight away, so links to them work without a restart.

### Fixed

- Dragging a feature now lands at the indent level the preview showed.

[Full changes](https://github.com/mattobee/chocks/compare/v0.1.2...v0.1.3)
