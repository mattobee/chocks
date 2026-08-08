---
title: Edit a feature description
status: released
code:
  - path: src/ui/routes/_layout/f.$featureKey.tsx
  - path: src/ui/components/markdown.tsx
  - path: src/ui/routes/feature-title.test.tsx
    kind: test
  - path: e2e/features.spec.ts
    kind: test
sort: a3
uid: d6bf96f2dc
---

The feature page lets you edit its markdown description, including clearing it entirely. Changes made in the UI preserve the rest of the file's frontmatter.
