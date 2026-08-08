---
title: Check code matches
status: released
code:
  - path: src/server/code.ts
  - path: src/server/code.test.ts
    kind: test
  - path: src/ui/components/feature-code.tsx
  - path: src/ui/components/feature-code.test.tsx
    kind: test
sort: a1
uid: a38c63cfa9
---

The feature page checks each path against the repo and shows how many files match. A claim with no matches is shown as broken; feature flags are skipped because they are keys rather than paths.
