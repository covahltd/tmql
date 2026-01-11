---
"tmql": minor
---

Add core pipeline stages: $sort, $limit, $skip, and $unwind

- $sort: Type-safe sorting with support for nested fields and $meta text score
- $limit: Limit documents in pipeline output
- $skip: Skip documents for pagination
- $unwind: Deconstruct array fields with full type inference, supports includeArrayIndex and preserveNullAndEmptyArrays options
