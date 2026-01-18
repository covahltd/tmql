# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Structure

This is a **bun workspaces monorepo** with two packages under different licenses:

```
tmql/
├── packages/
│   ├── tmql/                    # Core library (Apache 2.0 - OSI-approved)
│   │   ├── src/
│   │   │   ├── pipeline/        # TMPipeline - aggregation builder
│   │   │   ├── stages/          # Pipeline stage implementations
│   │   │   ├── elements/        # Type system building blocks
│   │   │   ├── collection/      # TMCollection wrapper
│   │   │   ├── source/          # TMSource interface
│   │   │   ├── utils/           # Type utilities
│   │   │   ├── singleton/       # Global tmql instance
│   │   │   └── database/        # TMDatabase utilities
│   │   ├── examples/            # Pipeline usage examples
│   │   ├── benchmarking/        # TypeScript performance benchmarks
│   │   └── LICENSE              # Apache License 2.0
│   │
│   └── tmql-orchestration/      # DAG orchestration (ELv2 - commercial)
│       ├── src/
│       │   ├── model/           # TMModel - materializable pipelines
│       │   └── project/         # TMProject - DAG orchestrator
│       ├── examples/            # DAG usage examples
│       └── LICENSE              # Elastic License 2.0
│
└── package.json                 # Root workspace config (private)
```

### Licensing Rationale

- **tmql (Apache 2.0)**: Core pipeline builder. Fully OSI-approved, can be used anywhere.
- **tmql-orchestration (ELv2)**: DAG execution and materialization features. Commercial-friendly but not OSI-approved.

### Package Dependencies

- `tmql-orchestration` has `tmql` as a **peer dependency** (`^0.4.1`)
- During development, `workspace:*` links them locally
- Users install both packages explicitly

## Development Commands

- **Build**: `bun run build` - Builds both packages via TypeScript project references
- **Build Watch**: `bun run build:watch` - Watch mode for both packages
- **Clean**: `bun run clean` - Remove dist directories
- **Lint**: `bun run lint` - Run ESLint
- **Lint**: `bun run format` - Run Prettier
- **Type Inspection**: `bun run tsx .claude/inspect-types.ts <variableName> [fileName]` - Debug complex TypeScript types
- **Local MongoDB Testing**: `bun run tsx .claude/local-mongodb.ts` - Start in-memory MongoDB with test data and run example pipelines

## Architecture Overview

**tmql** (Typed Mongo Query Language) is a TypeScript MongoDB aggregation pipeline builder that provides full type safety.

### Core Classes

- **TMPipeline**: The main aggregation pipeline builder class located in `packages/tmql/src/pipeline/TMPipeline.ts` with three generic types:
  - `StartingDocs`: The original document schema (union types supported)
  - `PreviousStageDocs`: The current document schema after previous pipeline stages (defaults to StartingDocs)
  - `Mode`: Lookup mode - `"runtime"` (default) or `"model"` for DAG pipelines

  Each pipeline method returns a new `TMPipeline` instance with updated types to maintain type safety throughout the chain.

- **TMModel**: Located in `packages/tmql-orchestration/src/model/TMModel.ts`. A named, materializable pipeline with typed input/output. Models can depend on collections or other models, forming a DAG. Generic parameters:
  - `TName`: Model name literal (e.g., `"stg_events"`)
  - `TInput`: Input document type from source
  - `TOutput`: Output document type after pipeline
  - `TMat`: Materialization config type

  Static presets for materialization modes:
  - `TMModel.Mode.Replace` - Uses `$out` to replace entire collection
  - `TMModel.Mode.Upsert` - Uses `$merge` with `on: "_id"`, upsert semantics
  - `TMModel.Mode.Append` - Uses `$merge` with `whenMatched: "fail"`, insert only

- **TMProject**: Located in `packages/tmql-orchestration/src/project/TMProject.ts`. DAG orchestrator that manages models, resolves dependencies, validates the graph, and executes models in topological order. Models are provided at construction time and validated immediately (immutable after creation). Auto-discovers all dependencies (upstream via `from` and lookup via `lookup`/`unionWith` stages) - just specify leaf models.

- **TMSource**: Located in `packages/tmql/src/source/TMSource.ts`. Unified interface that both `TMCollection` and `TMModel` implement, allowing them to be used interchangeably as pipeline sources.

### Type System Architecture

The type system is organized into modular building blocks located in `packages/tmql/src/elements/`:

#### Core Type Modules (`packages/tmql/src/elements/`)

- **document.ts**: Base `Document` type (`Record<string, any>`)

- **fieldSelector.ts**: Field selectors for use as keys in queries (e.g., in `$match`)
  - `PathsIncludingArrayIndexes<T>`: Recursive path traversal supporting array indices
  - `FieldSelector<Schema>`: All valid field paths including dotted notation and array indices
  - `GetFieldType<Schema, Path>`: Type resolution for a field path
  - `InferFieldSelector<Schema, Selector>`: Infers the type at a given field selector
  - Array index access supported (e.g., `"items.0.name"`)

- **fieldReference.ts**: Field references for use in expression values (prefixed with `$`)
  - `FieldPath<T>`: Recursive path traversal without array indices
  - `FieldReference<Schema>`: Dollar-prefixed field paths (e.g., `"$user.name"`)
  - `GetFieldTypeWithoutArrays<Schema, Path>`: Type resolution traversing through arrays
  - `InferFieldReference<Schema, Ref>`: Infers the type at a given field reference
  - `InferNestedFieldReference<Schema, Obj>`: Recursively resolves field references in nested structures
  - Array traversal without indices (field references apply to all array elements)

- **literals.ts**: Literal value type constraints

- **arrayOperator.ts**: Array operation type utilities

#### Utility Types (`packages/tmql/src/utils/core.ts`)

- **Type Utilities**:
  - `DollarPrefixed<T>` / `WithoutDollar<T>`: Dollar prefix manipulation
  - `Prettify<T>`: Improves TypeScript intellisense display
  - `Join<K, P>`: Dot notation path joining
  - `IndexStr<A>`: Array index string generation for tuples
  - `NoDollarString`: String type that cannot start with `$`
  - `NonExpandableTypes`: Types that should not be recursively expanded (Function, BSON types, Date)

### Pipeline Stages

Located in `packages/tmql/src/stages/`:

- **match.ts**: `$match` filtering with comprehensive type narrowing
  - **Query Types**: `MatchQuery<Schema>` with support for field selectors
  - **Operators Supported**:
    - Equality: `$eq`, `$ne`
    - Comparison: `$gt`, `$gte`, `$lt`, `$lte` (for numbers and dates)
    - Existence: `$exists`, `$type`
    - Arrays: `$size`, `$in`, `$nin`, `$all`, `$elemMatch`
    - Regex: Direct RegExp or `$regex` operator for strings
    - Logical: `$and`, `$or`, `$nor`, `$not`
    - Expressions: `$expr`
  - **Type Narrowing**: `ResolveMatchOutput<Query, Schema>` filters union types based on query
  - **Union Support**: `FilterUnion<Union, Query>` validates each union member against query fields
  - Advanced query validation with `MatchersForType<T>` and `ComparatorMatchers<T>`

TODO: Document the rest of the stages

## Development Patterns

- Use `bun` as the package manager (specified in package.json)
- TypeScript strict mode is enabled
- Modular architecture: type utilities separated into `packages/tmql/src/elements/` for reusability
- Examples in `examples/*.ts` demonstrate example pipeline use cases
- Assertions in `packages/tmql/src/*/*.typeAssertions.ts` are used as tests for type functionality
- The `custom()` method allows escape hatches for unsupported aggregation stages while maintaining type flow

## Type Inspection Tools & Debugging

When debugging complex type inference issues in this project, these approaches are most effective:

### ts-morph for Runtime Type Inspection

**Efficient Token Usage**: Use the dedicated `inspect-types.ts` file for type inspection:

```bash
# Run type inspection for variables/types/functions
bun run tsx .claude/inspect-types.ts <variableName> [fileName]

# Examples:
bun run tsx .claude/inspect-types.ts _pipeline exampleFile.ts
bun run tsx .claude/inspect-types.ts OutputType exampleFile.ts
```

The `.claude/inspect-types.ts` file is a CLI tool that:

- Loads the project with proper tsconfig.json configuration
- Inspects variable, type alias, and function declarations
- Shows resolved TypeScript types with pretty formatting
- Displays pipeline method return types (like `.getPipeline()`)
- Reports TypeScript diagnostics and errors
- Lists available declarations when target not found

**Key ts-morph patterns for this project**:

- Use `node.getType().getText()` to see resolved types
- Use `typeChecker.getTypeAtLocation()` for specific positions
- Use `project.getPreEmitDiagnostics()` to catch type errors programmatically

### Debugging Complex Generic Types

For the TMPipeline's complex generics (`StartingDocs`, `PreviousStageDocs`):

1. **Check type narrowing**: Focus on `ResolveMatchOutput` and `FilterUnion` in `packages/tmql/src/stages/match.ts`
2. **Check field resolution**: Verify `GetFieldType` and `InferFieldSelector` in `packages/tmql/src/elements/fieldSelector.ts`
3. **Prettify output**: Use the `Prettify<T>` utility from `packages/tmql/src/utils/core.ts` to simplify complex intersections

### Common Type Issues & Solutions

- **`never` type in pipeline stages**: Usually indicates impossible type conditions in match operations or field resolution
- **Union type filtering**: Check that `FilterUnion` is properly evaluating each union member
- **Dotted field inference**: Use `FlattenDotSet` from `packages/tmql/src/utils/core.ts` to properly expand nested structures

### Local MongoDB Testing

For testing aggregation pipelines against real MongoDB behavior, use the `.claude/local-mongodb.ts` utility:

```bash
# Run with example pipelines
bun run tsx .claude/local-mongodb.ts

# Or import in test files
import { setupLocalMongo } from './.claude/local-mongodb';

const { db, collection, seedTestData, testPipeline, cleanup } = await setupLocalMongo();
await seedTestData(); // Populates with Speaker/Attendee test data
await testPipeline([{ $match: { type: "attendee" } }]);
await cleanup();
```

**The `.claude/local-mongodb.ts` utility provides:**

- In-memory MongoDB instance (no Docker required)
- Pre-seeded test data with Speaker/Attendee union types
- `testPipeline()` helper for running and displaying aggregation results
- Automatic cleanup and shutdown
- Perfect for verifying MongoDB quirks (e.g., array index behavior in $set)

**Key features:**

- Uses `mongodb-memory-server` for isolated testing
- Type-safe collection with `PersonDocument` union type
- Includes 5 example pipelines demonstrating common patterns
- First run downloads MongoDB binary (~70MB, cached for future runs)

## Important: Always Use Project tsconfig When Type Checking

When testing TypeScript type assertions or checking for type errors, **always use the project's tsconfig.json** to ensure consistent behavior with the IDE and build process.

### ❌ DON'T do this:

```bash
# This uses default TypeScript settings, not the project's config
npx tsc --noEmit packages/tmql/src/stages/set.typeAssertions.ts
bun run tsx some-file.ts  # May not catch all type issues
```

### ✅ DO this instead:

```bash
# Use the project's tsconfig for the entire project
npx tsc --noEmit --project tsconfig.json

# Or use the build command which uses tsconfig
bun run build

# For running type inspection with bun/tsx, the tool already works correctly:
bun run tsx .claude/inspect-types.ts <variableName> <fileName>
```

## Why This Matters

The project uses strict TypeScript settings in `tsconfig.options.json`:

- `exactOptionalPropertyTypes: true` - Affects how optional properties work
- `noUncheckedIndexedAccess: true` - Affects indexed access behavior
- `strict: true` and many other strict checks
- Custom module resolution and target settings

Running `tsc` on individual files without the project config will:

1. Use TypeScript's default settings (less strict)
2. Miss important type checking rules
3. Give different results than the IDE (which uses the project config)
4. Lead to false positives/negatives in type assertion tests

## Key Insight

The IDE (VS Code) automatically uses the project's tsconfig.json, which is why it shows the correct types and no errors when the types are actually working. Always validate against the full project build or using `--project tsconfig.json` to match IDE behavior.

## Type Assertion Tests

When the type assertion tests in `*.typeAssertions.ts` files show no errors in the IDE but fail when running `tsc` directly on the file, it means the types are actually correct but the test methodology was wrong. Always use the project build to verify type assertions.
