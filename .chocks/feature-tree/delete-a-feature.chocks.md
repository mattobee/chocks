---
title: Delete a feature
status: released
code:
  - path: src/ui/routes/_layout/f.$featureKey.tsx
  - path: src/ui/components/delete-feature-dialog.tsx
  - path: src/store/store.ts
  - path: src/ui/components/delete-feature-dialog.test.tsx
    kind: test
  - path: e2e/features.spec.ts
    kind: test
sort: a4
uid: e7c0a703ed
---

The feature page lets you delete a feature after confirmation. Deleting a parent removes its whole subtree, with the number of affected sub-features shown before the action.
