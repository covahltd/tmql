import { FieldSelector } from "../elements/fieldSelector";
import { Document } from "../utils/core";

// ============================================================================
// $sort Stage Types
// ============================================================================

/**
 * Sort direction: 1 for ascending, -1 for descending
 */
export type SortDirection = 1 | -1;

/**
 * Sort value can be a direction or $meta for text search scores
 */
export type SortValue = SortDirection | { $meta: "textScore" | "indexKey" };

/**
 * $sort stage query type
 *
 * Supports:
 * - Field sorting: { field: 1 } or { field: -1 }
 * - Nested field sorting: { "nested.field": 1 }
 * - Text score sorting: { score: { $meta: "textScore" } }
 *
 * @example
 * // Sort by createdAt descending, then name ascending
 * .sort({ createdAt: -1, name: 1 })
 *
 * @example
 * // Sort by nested field
 * .sort({ "user.lastName": 1 })
 */
export type SortQuery<Schema extends Document> = {
  [K in FieldSelector<Schema>]?: SortValue;
} & {
  // Allow additional string keys for $meta sorting on computed fields
  [key: string]: SortValue;
};

/**
 * $sort output type - documents pass through unchanged
 * Sorting only reorders documents, doesn't transform them
 */
export type ResolveSortOutput<Schema extends Document> = Schema;
