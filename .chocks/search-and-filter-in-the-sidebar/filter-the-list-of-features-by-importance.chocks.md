---
title: Filter the list of features by importance
status: released
code:
  - path: src/ui/components/feature-filter-menu.tsx
  - path: src/lib/tree.ts
  - path: src/ui/components/feature-filter-menu.test.tsx
    kind: test
  - path: src/lib/tree.test.ts
    kind: test
sort: a2
uid: c94e2f8b65
---

Filters the feature tree by high, normal or low effective importance. Inherited importance is treated the same as a value declared on the feature itself.
