# Seeding prompt

Give this to a coding agent to fill in a new feature tree from an existing codebase.

```
Read this codebase and populate .chocks with a feature tree.

A feature is a capability someone outside the team would recognise, not a file, a function or an internal system. Split down to individual actions where each has its own lifecycle: creating, editing and deleting a thing usually ship at different times, so `create-invoice`, `edit-invoice` and `delete-invoice` belong under `invoices/` as three features, not one. Stop splitting once you'd be naming something no user or PM would ever refer to separately, or that only exists because of how the code happens to be organised.

A leaf feature is <slug>.chocks.md. A feature with children is a <slug>/ directory with its own content in <slug>/index.chocks.md and its children alongside that index. Never create both <slug>.chocks.md and <slug>/ for one feature, and never create a feature directory without index.chocks.md.

For each feature, write a title, a status, tags for cross-cutting concerns such as "api" or "billing", and a couple of sentences describing it in the markdown body. The status must be one of planned, pre-release, released, deprecated or dropped, unless .chocks/config.yaml defines a different set, in which case use those ids exactly. Use released for something that looks fully built, and pre-release for something still missing pieces. Add a `links` list when the feature has a URL you can point to, but only then: a made-up or guessed URL is worse than none. Add a `code` list of the paths that implement it, since you're already reading them to write the description.

Only add features you can see in the code. Leave out anything referenced but not built, like a TODO or an empty route. You can't tell from the code whether it's planned or abandoned, and a wrong guess is harder to notice later than a gap.

Skip uid and sort. chocks fills those in the first time it runs. For example:

---
title: Daily digest email
status: pre-release
tags:
  - notifications
---

Sends once a day with everything you missed. Still behind a flag while the send time is settled.
```

If chocks is running while the agent works, it backfills uids for the new files as they land, with or without a tab open. If it isn't, it does the same the next time it starts.
