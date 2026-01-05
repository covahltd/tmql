import { Document, Prettify, WithoutDollar } from "../utils/core";
import { FieldReferencesThatInferTo } from "../elements/fieldReference";

// ============================================================================
// $unwind Stage Types
// ============================================================================

/**
 * Field reference that points to an array field
 * Only allows $-prefixed paths that resolve to array types
 */
export type UnwindPath<Schema extends Document> = FieldReferencesThatInferTo<
  Schema,
  unknown[]
>;

/**
 * $unwind stage options (extended form)
 *
 * @property path - The array field to unwind (e.g., "$items")
 * @property includeArrayIndex - Optional field name to store the array index
 * @property preserveNullAndEmptyArrays - If true, output documents for null/empty arrays
 */
export type UnwindOptions<
  Schema extends Document,
  IndexField extends string = never,
> = {
  path: UnwindPath<Schema>;
  includeArrayIndex?: IndexField;
  preserveNullAndEmptyArrays?: boolean;
};

/**
 * $unwind stage query type
 *
 * Supports:
 * - Simple form: "$arrayField"
 * - Extended form: { path: "$arrayField", includeArrayIndex: "idx", preserveNullAndEmptyArrays: true }
 *
 * @example
 * // Simple unwind
 * .unwind("$items")
 *
 * @example
 * // With options
 * .unwind({ path: "$items", includeArrayIndex: "itemIndex", preserveNullAndEmptyArrays: true })
 */
export type UnwindQuery<
  Schema extends Document,
  IndexField extends string = never,
> = UnwindPath<Schema> | UnwindOptions<Schema, IndexField>;

// ============================================================================
// Output Type Resolution
// ============================================================================

/**
 * Transform an array type to its element type
 * T[] becomes T, nested arrays flatten one level
 */
type UnwoundField<T> = T extends (infer E)[] ? E : T;

/**
 * Resolve the output type of an $unwind stage
 *
 * - The unwound array field becomes its element type (T[] -> T)
 * - If includeArrayIndex is specified, adds that field with type number
 * - All other fields remain unchanged
 *
 * @example
 * type Input = { _id: string; items: { name: string; qty: number }[] };
 * type Output = ResolveUnwindOutput<Input, "items", never>;
 * // { _id: string; items: { name: string; qty: number } }
 *
 * @example
 * type Output = ResolveUnwindOutput<Input, "items", "idx">;
 * // { _id: string; items: { name: string; qty: number }; idx: number }
 */
export type ResolveUnwindOutput<
  Schema extends Document,
  Path extends string,
  IndexField extends string = never,
> =
  Schema extends unknown ?
    Prettify<
      {
        [K in keyof Schema]: K extends Path ? UnwoundField<Schema[K]>
        : Schema[K];
      } & ([IndexField] extends [never] ? {} : { [K in IndexField]: number })
    >
  : never;

/**
 * Helper to extract path from unwind query (string or options object)
 */
export type ExtractUnwindPath<Query> =
  Query extends string ? WithoutDollar<Query>
  : Query extends { path: infer P extends string } ? WithoutDollar<P>
  : never;

/**
 * Helper to extract index field from unwind options
 */
export type ExtractIndexField<Query> =
  Query extends (
    {
      includeArrayIndex: infer I extends string;
    }
  ) ?
    I
  : never;
