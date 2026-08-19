/**
 * PipeSafe Intake
 *
 * Declarative replication of third-party data into MongoDB. Declare
 * Webhooks (verified endpoints landing raw envelopes) and Intakes (one
 * idempotent replication unit per external entity, with a scheduled batch
 * route and an optional webhook-driven event route), then run them locally
 * or deploy the serverless infrastructure via @pipesafe/infra.
 *
 * Because an intake run is idempotent it is a reconciliation job by nature:
 * backfill, incremental sync and gap recovery are the same handler invoked
 * with different scopes. Landing collections are core Collections
 * (Sources), so replicated data feeds Pipelines and manifold Models
 * directly.
 */

// Declarative units
export { Webhook } from "./webhook/Webhook";
export { Intake } from "./intake/Intake";
export { verifiers } from "./verify/Verifier";

// Deployment unit
export { IntakeStack } from "./stack/IntakeStack";

// Errors
export { IntakeNotImplementedError } from "./errors";

// Envelope ledger
export type { IntakeEnvelope, EnvelopeStatus } from "./envelope/Envelope";

// Scope - what a run is invoked with
export type {
  IntakeScope,
  BatchScope,
  EventScope,
  Duration,
} from "./intake/Scope";

// Configuration types
export type { WebhookConfig } from "./webhook/Webhook";
export type {
  IntakeConfig,
  IntakeBatchConfig,
  IntakeEventConfig,
  IntakeOutput,
  IntakeDeletes,
  IntakeSchedule,
  IntakeHandler,
  IntakeContext,
  IntakeMeta,
  IntakeRunResult,
  IntakeLogger,
  OverlapPolicy,
} from "./intake/Intake";
export type { Verifier, VerifyContext, VerifyResult } from "./verify/Verifier";
export type {
  IntakeStackConfig,
  EventDispatch,
  DeployOptions,
  DeployPlan,
  DeployResult,
  DevOptions,
  LocalIntakeServer,
  ReplayOptions,
  ReplayResult,
  IntakeStackStatus,
  IntakeValidationResult,
  IntakeValidationError,
} from "./stack/IntakeStack";
