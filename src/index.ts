/**
 * Typed Mongo Query Language (tmql)
 *
 * Main entry point for the tmql library.
 * Provides type-safe MongoDB aggregation pipeline building.
 */

export { tmql } from "./singleton/tmql";

export { TMPipeline } from "./pipeline/TMPipeline";
export type { InferPipelineOutput, LookupMode } from "./pipeline/TMPipeline";

export { TMCollection } from "./collection/TMCollection";
export type { InferCollectionType } from "./collection/TMCollection";

// DAG Pipeline Composition
export { TMModel } from "./model/TMModel";
export type {
  ModelConfig,
  MaterializeConfig,
  TypedTimeSeriesOptions,
  CollectionMode,
  MergeOptions,
  InferModelOutput,
} from "./model/TMModel";

export { TMProject } from "./project/TMProject";
export type {
  ProjectConfig,
  RunOptions,
  ModelRunStats,
  ProjectRunResult,
  ExecutionPlan,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from "./project/TMProject";
// TMSource - unified source type for model-aware lookups
export type { TMSource, InferSourceType } from "./source/TMSource";

// Re-export core types for convenience
export type { Document, Prettify } from "./utils/core";
export type {
  FieldSelector,
  FieldSelectorsThatInferTo,
  TopLevelField,
} from "./elements/fieldSelector";
