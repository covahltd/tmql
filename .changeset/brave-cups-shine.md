---
"tmql": minor
---

Add $cond and $ifNull conditional expression operators

- $cond: Conditional branching with 3 operands (condition, true value, false value)
- $ifNull: Support for n arguments for fallback chains (minimum 2)
- Full type inference for both operators with proper union type handling
- Support for nested expressions, field references, and literals in operands
