/**
 * IntakeStack - the deployment unit
 *
 * Analogous to manifold's Project: constructed with the declarative units
 * (Webhooks and Intakes) and immutable afterwards. Owns local execution
 * (dev/replay) and delegates provisioning to @pipesafe/infra's engine
 * (plan/deploy/status/teardown), composing the ingestion-specific resource
 * specs - gateway, runners, sweeper - for the chosen provider. The name
 * mirrors the Pulumi ComponentResource this lowers to, so the same stack is
 * either deployed by pipesafe or instantiated inside a user's own program.
 *
 * Construction-time validation (like Project's) lands in Phase 1; until
 * then validate() throws.
 *
 * Client resolution follows the suite pattern: `options.client ??
 * pipesafe.client`, throw if neither, `tagClient()`.
 */
import type { MongoClient } from "mongodb";
import type {
  InfraProvider,
  SecretRef,
  StateStoreOptions,
} from "@pipesafe/infra";
import type { EnvelopeStatus } from "../envelope/Envelope";
import type { Intake } from "../intake/Intake";
import type { Webhook } from "../webhook/Webhook";
import { IntakeNotImplementedError } from "../errors";

/**
 * How landed envelopes become event runs.
 *
 * Polling is the default and the primary strategy: a claim naturally scoops
 * up everything accumulated since the last run, which is exactly the shape
 * identifier coalescing wants, and it keeps a deployment to functions,
 * schedules and secrets - the resource kinds that port across clouds. A
 * change stream trades that portability (it needs an always-on watcher) for
 * lower idle latency on low-volume, latency-sensitive sources.
 */
export type EventDispatch =
  | { strategy: "poll"; intervalSeconds?: number }
  | { strategy: "changeStream" };

export interface IntakeStackConfig {
  /** Deployment namespace, e.g. "acme-prod". */
  name: string;
  /* `any` mirrors manifold's Project: Collection is invariant in its doc
     type, so concretely-typed units don't assign to Document-typed ones. */
  webhooks: Webhook<string, any>[];
  intakes: Intake<string, any, any>[];
  /** What the deployed functions use to reach MongoDB. */
  mongoUri: SecretRef;
  database?: string;
  /** Defaults to `{ strategy: "poll" }`. */
  dispatch?: EventDispatch;
}

export interface DeployOptions {
  provider: InfraProvider;
  /**
   * Path to the module that default-exports this IntakeStack - the
   * bundling unit shipped to the cloud functions.
   */
  entry: string;
  /** State-store client; falls back to `pipesafe.client`. */
  client?: MongoClient;
  /** Deploy state and locks - may target a different cluster. */
  stateStore?: StateStoreOptions;
  /** Values for declared SecretRefs (else read from process.env). */
  secrets?: Record<string, string>;
}

export interface IntakeValidationError {
  type:
    | "duplicate_name"
    | "duplicate_path"
    | "duplicate_output"
    | "missing_webhook";
  message: string;
}

export interface IntakeValidationResult {
  valid: boolean;
  errors: IntakeValidationError[];
}

export interface DevOptions {
  port?: number;
  client?: MongoClient;
}

export interface LocalIntakeServer {
  port: number;
  close(): Promise<void>;
}

export interface ReplayOptions {
  client?: MongoClient;
  /** Restrict to one webhook's envelopes. */
  source?: string;
  /** Defaults to ["failed"]. */
  status?: EnvelopeStatus[];
  since?: Date;
}

export interface ReplayResult {
  replayed: number;
  succeeded: number;
  failed: number;
}

export interface DeployPlan {
  creates: string[];
  updates: string[];
  deletes: string[];
  unchanged: string[];
}

export interface DeployResult {
  plan: DeployPlan;
  /** e.g. webhook URLs keyed by webhook name. */
  endpoints: Record<string, string>;
}

export interface IntakeStackStatus {
  deployed: boolean;
  endpoints: Record<string, string>;
  envelopes: Partial<Record<EnvelopeStatus, number>>;
}

export class IntakeStack {
  private readonly config: IntakeStackConfig;

  constructor(config: IntakeStackConfig) {
    this.config = config;
  }

  getName(): string {
    return this.config.name;
  }

  getWebhooks(): Webhook<string, any>[] {
    return [...this.config.webhooks];
  }

  getIntakes(): Intake<string, any, any>[] {
    return [...this.config.intakes];
  }

  /**
   * Unique names, paths and output collections; every event route
   * references a webhook registered on this stack.
   */
  validate(): IntakeValidationResult {
    throw new IntakeNotImplementedError("IntakeStack.validate");
  }

  /**
   * Local dev server: a real HTTP endpoint per webhook path, envelope
   * dispatch, and the same gateway/runner code paths as the cloud.
   */
  dev(_options?: DevOptions): Promise<LocalIntakeServer> {
    throw new IntakeNotImplementedError("IntakeStack.dev");
  }

  /** Re-run event routes over stored envelopes (failed ones by default). */
  replay(_options?: ReplayOptions): Promise<ReplayResult> {
    throw new IntakeNotImplementedError("IntakeStack.replay");
  }

  /** Diff desired infrastructure against recorded state - no changes. */
  plan(_options: DeployOptions): Promise<DeployPlan> {
    throw new IntakeNotImplementedError("IntakeStack.plan");
  }

  /** Provision/update cloud resources to match this declaration. */
  deploy(_options: DeployOptions): Promise<DeployResult> {
    throw new IntakeNotImplementedError("IntakeStack.deploy");
  }

  status(_options: DeployOptions): Promise<IntakeStackStatus> {
    throw new IntakeNotImplementedError("IntakeStack.status");
  }

  /** Destroy cloud resources. Landing collections are never touched. */
  teardown(_options: DeployOptions): Promise<void> {
    throw new IntakeNotImplementedError("IntakeStack.teardown");
  }
}
