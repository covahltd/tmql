---
"@pipesafe/core": minor
"@pipesafe/manifold": minor
---

Rename tmql monorepo to PipeSafe

Breaking changes:

- Package renamed from `tmql` to `@pipesafe/core`
- Package renamed from `tmql-orchestration` to `@pipesafe/manifold`
- All class prefixes removed: `TMPipeline` → `Pipeline`, `TMCollection` → `Collection`, etc.
- Singleton renamed from `tmql` to `pipesafe`
