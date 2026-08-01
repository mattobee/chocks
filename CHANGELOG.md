# Changelog

What changed for people using chocks. Internal tidying, dependency bumps and documentation
don't appear here.

Releases before 0.1.3 predate this file.

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
