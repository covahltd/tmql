import { Assert, Equal } from "../utils/tests";
import { SortQuery, ResolveSortOutput } from "./sort";

/**
 * Type Resolution Behaviors for $sort Stage:
 *
 * FEATURES:
 * 1. SORT DIRECTION:
 *    Supports 1 (ascending) and -1 (descending) for any field.
 *
 * 2. NESTED FIELD SORTING:
 *    Supports dot notation for nested fields.
 *    Example: { "user.name": 1 } sorts by nested user.name field
 *
 * 3. TEXT SCORE SORTING:
 *    Supports { $meta: "textScore" } for text search result scoring.
 *
 * 4. OUTPUT PRESERVATION:
 *    $sort does not transform documents - output type equals input type.
 *
 * These tests use Assert<Equal> which checks structural compatibility.
 */

// ============================================================================
// Basic Sort Queries
// ============================================================================

// Test 1: Simple field sort
type SimpleSchema = {
  name: string;
  age: number;
  createdAt: Date;
};

// Verify sort query accepts valid fields
type SimpleSortQuery = SortQuery<SimpleSchema>;
type SimpleSortTest = Assert<
  Equal<
    {
      name?: 1 | -1 | { $meta: "textScore" | "indexKey" };
      age?: 1 | -1 | { $meta: "textScore" | "indexKey" };
    },
    Pick<SimpleSortQuery, "name" | "age">
  >
>;

// Test 2: Output is unchanged
type SortOutput = ResolveSortOutput<SimpleSchema>;
type SortOutputTest = Assert<Equal<SortOutput, SimpleSchema>>;

// ============================================================================
// Nested Field Sorting
// ============================================================================

// Test 3: Nested fields
type NestedSchema = {
  user: {
    profile: {
      firstName: string;
      lastName: string;
    };
    age: number;
  };
  createdAt: Date;
};

type NestedSortQuery = SortQuery<NestedSchema>;
// Should accept nested field selectors
type NestedSortTest = Assert<
  Equal<
    { "user.profile.firstName"?: 1 | -1 | { $meta: "textScore" | "indexKey" } },
    Pick<NestedSortQuery, "user.profile.firstName">
  >
>;

// ============================================================================
// Array Field Sorting
// ============================================================================

// Test 4: Array fields (sorts by first element or specified criteria)
type ArraySchema = {
  tags: string[];
  scores: number[];
};

type ArraySortQuery = SortQuery<ArraySchema>;
type ArraySortTest = Assert<
  Equal<
    { tags?: 1 | -1 | { $meta: "textScore" | "indexKey" } },
    Pick<ArraySortQuery, "tags">
  >
>;

// ============================================================================
// Union Type Handling
// ============================================================================

// Test 5: Union types preserve through sort
type UnionSchema =
  | { type: "user"; name: string; email: string }
  | { type: "admin"; name: string; permissions: string[] };

type UnionSortOutput = ResolveSortOutput<UnionSchema>;
type UnionSortTest = Assert<Equal<UnionSortOutput, UnionSchema>>;

// Export test types to prevent unused variable errors
export type {
  SimpleSortTest,
  SortOutputTest,
  NestedSortTest,
  ArraySortTest,
  UnionSortTest,
};
