# tmql

**Typed Mongo Query Language** - A fully type-safe MongoDB aggregation pipeline builder for TypeScript projects.

## Purpose

tmql provides compile-time type safety for MongoDB aggregation pipelines, ensuring that:
- Field references are validated against your document schemas
- Pipeline stage outputs are correctly inferred through each transformation
- Type errors are caught at development time, not runtime

## Quick Example

```typescript
import { TMPipeline, InferOutputType } from "tmql";

type User = {
  userId: string;
  email: string;
  profile: {
    firstName: string;
    lastName: string;
  };
  metadata: {
    isActive: boolean;
  };
};

const pipeline = new TMPipeline<User>()
  .match({
    "metadata.isActive": true, // ✅ Type-checked field paths
  })
  .project({
    userId: 1,
    email: 1,
    fullName: { $concat: ["$profile.firstName", " ", "$profile.lastName"] },
  });

type Output = InferOutputType<typeof pipeline>;
// Output is correctly inferred: { userId: string; email: string; fullName: string; }
```

## Features

- **Type-safe field references** - Field paths are validated against your document types
- **Automatic output inference** - Each pipeline stage correctly types its output
- **Supported stages** - `match`, `project`, `set`, `unset`, `group`, `lookup`, `replaceRoot`, `unionWith`, `out`
- **Collection-aware lookups** - Type-safe joins with automatic type inference
- **Full TypeScript support** - Leverages TypeScript's type system for maximum safety

## Status

This package is currently in development and not yet published to npm.
