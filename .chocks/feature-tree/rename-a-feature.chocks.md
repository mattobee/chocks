---
title: Rename a feature
status: released
code:
  - path: src/ui/routes/_layout/f.$featureKey.tsx
  - path: src/store/store.ts
  - path: src/ui/routes/feature-title.test.tsx
    kind: test
  - path: e2e/features.spec.ts
    kind: test
sort: a2
uid: c5ae85e1cb
---

The feature page lets you rename a feature. Its file moves to match the new title while stable links continue to resolve through its uid.
