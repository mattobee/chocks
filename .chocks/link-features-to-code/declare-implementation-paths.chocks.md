---
title: Declare implementation paths
status: released
code:
  - path: src/lib/code.ts
  - path: src/store/format.ts
  - path: src/store/format.test.ts
    kind: test
sort: a0
uid: f27b52be98
---

A feature's frontmatter accepts ordered repo-relative paths or globs, classified as code, test or feature flag claims. Hand-written entries are normalised and capped at 20.
