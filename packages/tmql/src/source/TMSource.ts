/**
 * TMSource - Unified Source Type
 *
 * Shared type definitions for sources that can be used in pipelines.
 * This file exists to avoid circular imports between TMPipeline and TMModel.
 */

/**
 * Interface that both TMCollection and TMModel implement.
 * Allows them to be used interchangeably as pipeline sources.
 */
export interface TMSource<T = unknown> {
  /** Discriminator for runtime type checking */
  readonly sourceType: "collection" | "model";

  /**
   * Get the collection name to query from.
   * - For collections: returns the collection name
   * - For models: returns the output collection name
   */
  getOutputCollectionName(): string;

  /** @internal Phantom type for inference - do not use directly */
  readonly __outputType: T;
}

/**
 * Infer document type from a TMSource.
 * Uses the __outputType phantom property on TMCollection and TMModel.
 */
export type InferSourceType<S> =
  S extends { __outputType: infer T } ? T : never;
