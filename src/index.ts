/**
 * Typed Mongo Query Language (tmql)
 *
 * DEPRECATED: Import from 'tmql' and 'tmql-orchestration' packages instead.
 *
 * This file re-exports from the monorepo packages for backwards compatibility
 * with examples and tests. The actual source code now lives in:
 * - packages/tmql/ (core library - Apache 2.0)
 * - packages/tmql-orchestration/ (DAG orchestration - ELv2)
 */

// Core (from tmql package)
export { tmql } from "./singleton/tmql";
export { TMPipeline } from "./pipeline/TMPipeline";
export { TMCollection } from "./collection/TMCollection";

// DAG Composition (from tmql-orchestration package)
export { TMModel, isTMModel } from "./model/TMModel";
export { TMProject } from "./project/TMProject";

// Type inference helpers
export type { InferOutputType } from "./pipeline/TMPipeline";
export type { InferCollectionType } from "./collection/TMCollection";
export type { InferModelOutput } from "./model/TMModel";
export type { TMSource, InferSourceType } from "./source/TMSource";
export type { Document } from "./utils/core";
