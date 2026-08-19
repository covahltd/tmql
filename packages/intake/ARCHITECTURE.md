# @pipesafe/intake + @pipesafe/infra — Architecture

Declarative replication of third-party data into MongoDB: describe an
external entity in TypeScript and intake keeps a landing collection
converged with it — where it surfaces as a core `Collection<T>`, ready for
Pipelines and manifold `Model`/`Project` DAGs.

The responsibility split across the suite:

- **`@pipesafe/intake`** (ELv2) — the ingestion domain, and ONLY that:
  getting external data into landing collections and keeping it converged.
  `Intake`, `Webhook`, the `IntakeEnvelope` ledger, verifiers, and the
  `IntakeStack` deployment unit. Intake's job ends when a document lands; it
  does not own reactions to those documents.
- **`@pipesafe/manifold`** (ELv2) — transformations, in both execution
  modes: batch (`Project.run`, pull-based, today) and event-driven
  (change-stream subscriptions — scaffold in `src/events/`). Manifold and
  core operate on ANY collection in the connected MongoDB — application
  operational data, other ETL tools' landing collections, CDC replicas,
  other services' databases, and manifold's own model outputs. Intake is
  merely one producer among many, and intake does NOT depend on manifold.
- **`@pipesafe/infra`** (ELv2) — the shared infrastructure engine: the
  Pulumi component/program seam and `SecretRef`s. Intake deploys ingestion
  infrastructure through it today; manifold deploys scheduled/reactive
  transformation jobs through it later. Nothing in infra may reference
  ingestion (or any other domain) concepts — that boundary is a review gate.

Dependency direction: intake peers on core and infra; manifold peers on core
only; infra peers on core only.

Status: **Phase 0** — this document plus type-level scaffolds. No runtime
yet. See the [roadmap](#roadmap) for the path to a working MVP.

## Design principles

1. **One idempotent unit, invoked with different scopes.** An `Intake` run
   is idempotent, which makes it a reconciliation job by its very nature.
   Backfill, incremental sync, gap recovery after a missed webhook, replay
   and reconciliation are therefore not five features — they are one unit
   invoked with different `IntakeScope`s. Cadence is just how often a scope
   is issued.
2. **Scope in, not state out.** A run is told what to cover; it does not
   depend on a persisted cursor being intact. Lookback windows overlap on
   purpose, and idempotent writes make the overlap free. Cursors and
   checkpoints may be added later purely as "don't re-read what you don't
   need" optimizations — they must never become load-bearing for
   correctness, because the failure mode of load-bearing sync state is an
   incident rather than a slow run.
3. **MongoDB-native data plane.** The envelope collection is the queue, the
   retry/DLQ ledger, and the replay/audit surface, queryable with PipeSafe
   itself. This is orthogonal to who owns the deploy.
4. **Landing collections are core `Collection<T>`s** — already `Source<T>` —
   so replicated data feeds Pipelines and manifold Models with zero
   adapters.
5. **Honest delivery semantics.** Exactly-once _delivery_ across process
   boundaries is impossible (sender retries, function retries and dispatch
   redelivery are all at-least-once). Intake pairs at-least-once transport
   with idempotency at both write points — envelope `_id` dedupe at the
   gateway, natural-key upserts guarded by a monotonic version at the
   writer — for **effectively-once processing**.
6. **Declarative units, one deployment unit** (manifold symmetry: `Model` +
   `Project`). `Webhook` and `Intake` do no I/O; `IntakeStack` validates,
   runs locally, and deploys.
7. **Suite client conventions.** Runtime pieces resolve the client as
   `options.client ?? pipesafe.client` (throw if neither) and call
   `tagClient()`, exactly like `Collection`, `Database`, and `Project`.

## `IntakeScope` — the only run input

```ts
type IntakeScope =
  | { kind: "batch"; window?: { from?: Date; to?: Date } }
  | { kind: "event"; identifiers: string[] };
```

An absent window — or an absent bound — is unbounded in that direction, so a
full sweep is `{ kind: "batch" }` and there is no separate "all" scope.
Schedules declare a `lookback`; the runner resolves it to concrete dates
before the handler sees it, so no handler computes its own window.

The union is authoritative: it is what `Intake.run` accepts and what the run
ledger records. Handlers receive their own arm (`BatchScope` / `EventScope`,
both `Extract`ed from the union) so neither has to narrow something that
cannot vary in its position.

## The declarative units

### `Intake<TName, TEvent, TDoc>`

One intake replicates one external entity into one landing collection, by
two routes to the same documents:

- **The batch route** (always present) — a handler over a window, run on any
  number of schedules. This is the reconciliation job. A typical entity
  declares a frequent narrow window, a periodic wide one, and an unbounded
  sweep:

  ```ts
  schedules: [
    { cron: "*/5 * * * *", lookback: "1h" }, // keep fresh
    { cron: "0 3 * * *", lookback: "7d" }, // catch what the webhook missed
    { cron: "0 4 * * 0" }, // unbounded: converges deletions
  ];
  ```

  A historical backfill needs no declaration at all: it is
  `intake.run({ kind: "batch", window: { from, to } })`.

- **The event route** (optional) — a handler over natural keys extracted
  from webhook envelopes, for sources where waiting for the next batch tick
  is too slow. It references a `Webhook` rather than owning one, because one
  provider endpoint commonly feeds several intakes (one Stripe endpoint →
  customers, invoices, subscriptions).

Both routes yield the same `TDoc` into the same collection under the same
natural key. That shared type is what makes idempotency meaningful ACROSS
the routes, not merely within each.

**Coalescing needs no configuration.** The dispatcher dedupes identifiers
across the claimed envelope set, so a burst of N events touching R resources
produces one run with R identifiers. This matters more than it looks:
measured against a live high-volume commercial source (notification-only
webhooks behind an account-wide limit of a few hundred requests per minute,
shared across every consumer), a batch dispatch run clearing ~50k
stock-movement events in one peak trading hour drains in **~4 hours fetched
one-per-event, ~1 hour per parent document, or under a minute per distinct
entity with ID-set batched requests (~30 requests for ~1.5k distinct
entities)** — three orders of magnitude from granularity alone, with the
worst case landing in the busiest trading hour of the year. Handing the
handler a SET of identifiers rather than one per call is what makes the
batched request expressible at all.

#### Output and idempotency

```ts
output: {
  collection: string;
  key: keyof TDoc & string;       // natural key -> _id
  version?: keyof TDoc & string;  // monotonic guard
  deletes?: { mode: "soft" | "hard"; sweep?: boolean };
}
```

- **`key`** drives the upsert and is written to `_id`, so downstream
  `Model.Mode.Upsert` (`$merge on: "_id"`) composes without extra keys. The
  landing type reflects the writer-set fields: `Collection<TDoc &
IntakeMeta>` where `IntakeMeta = { _id: string; _deletedAt?: Date | null }`.
- **`version`** is the monotonic guard: a write only applies when the source
  version is at least the stored one. This is required in practice once both
  routes are live — an event run and a batch run may legitimately be in
  flight over the same document, and last-write-wins would let an older
  fetch that landed second regress the record. `overlap` does NOT cover
  this; it governs batch-vs-batch only.
- **`deletes`** is how convergence is completed. Upserts alone never
  converge on deletion, so without this the word "reconciliation" would be
  an overclaim. Two mechanisms, both feeding one `mode`:
  - explicit — `ctx.delete(key)` from either handler (a `customer.deleted`
    event, or a 404 on a targeted fetch);
  - structural — `sweep: true` marks an UNBOUNDED batch run, upserts
    everything the handler yields, then applies `mode` to any document the
    run did not see. Only sound without a window: a bounded run has not
    looked at the whole entity.

  `mode: "soft"` stamps `_deletedAt`, which is optional AND nullable on
  `IntakeMeta` because all three states are real: absent (never deleted), a
  Date (soft-deleted), and null (deleted then resurrected by a later upsert
  — cleared rather than `$unset`). Downstream, filter live documents with
  the MongoDB idiom `{ _deletedAt: null }`, which matches a null value OR a
  missing field. `$exists: false` is the wrong matcher here: it is stricter
  than intended, excluding an explicitly-null document.

#### Budget and concurrency

`rateLimit` sits on the intake, not on either route, because a nightly sweep
and an event burst spend from the SAME third-party ceiling — neither route
can own it. `concurrencyLimit` sits on the event route, where it belongs: it
bounds fan-out, connection-pool pressure and function concurrency, but it
does NOT bound request rate, which at fixed concurrency drifts with API
latency.

### `Webhook<TName, TEvent>`

Declares an HTTP endpoint that receives third-party events, verifies them
against the **raw request bytes** (HMAC breaks on re-serialized JSON), and
persists the raw envelope. Exposes
`events: Collection<IntakeEnvelope<TEvent>>`.

Verification is a pluggable `Verifier` scheme: built-ins `verifiers.stripe()`
(Stripe-Signature v1 HMAC + timestamp tolerance), `verifiers.hmacSha256()`,
`verifiers.none()` (dev only; stores `verified: false`), and
`verifiers.custom()`. Schemes declare their secrets as `SecretRef`s so
deploys know what to provision.

### `IntakeEnvelope<TEvent>` — the ledger

Every accepted request is stored verbatim **before** any processing, with
`_id = "${webhookName}:${eventId}"` where `eventId` is extracted from the
payload by the webhook's `eventId` function (e.g. Stripe's `evt_...`). The
unique `_id` makes the envelope collection the idempotency ledger — and the
transport, and the DLQ:

```
received -> processing -> processed
                       -> failed  (sweeper retries with backoff)
                       -> dead    (after maxAttempts; re-drivable via replay)
```

Only an allowlisted header subset is persisted (never auth headers). Replays
and audits read this collection; it is the single source of truth for "what
arrived".

### `IntakeStack` — the deployment unit

Constructed with `{ name, webhooks, intakes, mongoUri, database?, dispatch? }`;
validates immediately (unique names/paths/output collections, event routes
referencing registered webhooks); immutable afterwards. Methods:
`validate()`, `dev()`, `replay()`, `plan()` / `deploy()` / `status()` /
`teardown()`.

The name mirrors the Pulumi `ComponentResource` this lowers to, so the same
stack is either deployed by pipesafe or instantiated inside a user's own
Pulumi program (see [Provisioning](#provisioning-three-layers-pipesafeinfra)).

## Delivery

1. **Gateway** (function URL): verify signature → insert envelope
   (`status: "received"`). Duplicate `_id` ⇒ already received: ack 200,
   done. Nothing else on the hot path.
2. **Dispatch** — envelopes become `{ kind: "event", identifiers }` runs:
   - **`poll`** (default and primary): a scheduled function claims pending
     envelopes atomically via `findOneAndUpdate` with a `leaseUntil` lease —
     lease expiry is the visibility timeout. A claim naturally scoops up
     everything accumulated since the last run, which is exactly the shape
     identifier coalescing wants and the natural dedupe point. It also keeps
     a deployment to functions, schedules and secrets: the resource kinds
     that genuinely port across clouds.
   - **`changeStream`**: lower idle latency for low-volume,
     latency-sensitive sources, at the cost of an always-on watcher (and
     therefore a container). Powers `dev()` in-process.
3. **Runner**: resolve the scope, run the route's handler, upsert yielded
   documents by natural key under the version guard, apply `ctx.delete`
   calls, mark envelopes `processed`. A crash between output-write and
   status-write causes a redelivery that harmlessly re-upserts.
4. **Retry/DLQ is the ledger**: failure ⇒ `failed` + `attempts++` +
   `lastError`. A scheduled **sweeper** re-drives `failed` envelopes with
   exponential backoff computed from `attempts`/`receivedAt`, and anything
   stuck in `received`/`processing` too long — so dispatch is self-healing
   regardless of strategy.

Because the batch route reconciles on its own schedule, a lost or
never-delivered webhook is a latency problem, not a data-loss problem. That
is the single biggest operational difference from a webhook-only design, and
it is why the batch route is mandatory and the event route optional.

Caveats: change streams require a replica set (Atlas always qualifies; the
test fixture `useMemoryMongo` already runs one); async-invoke ordering is not
guaranteed (fine — the ledger is authoritative and the version guard
protects the writer).

## Provisioning: three layers (`@pipesafe/infra`)

Most adopters already have an IaC tool and a review process around it. "Any
cloud, but our deploy engine" is still lock-in, so the engine is the
outermost layer, not the only one:

- **Layer 0 — runtime handlers, IaC-free.** Plain factories over an
  `IntakeStack`: gateway, runner, sweeper, watcher. No Pulumi, no cloud SDK.
  Anyone on Terraform, CDK, SST, Serverless Framework, a Kubernetes CronJob,
  or one long-running Node process can adopt intake by wiring these and a
  Mongo URI. This layer is also what makes the runtime testable without any
  provisioning at all.
- **Layer 1 — a Pulumi `ComponentResource`**, instantiated in the USER's
  program: their state backend, their stack config, their explicit provider,
  their VPC, their tags. Consumers must be able to reach the raw resources —
  `.nodes` for direct access, per-resource `transform` callbacks in the
  component args, and Pulumi's `registerResourceTransform` for the rest.
  Component args must cover `provider`/`providers` (multi-account,
  multi-region), `vpc`/`subnets`/`securityGroups`, a bring-your-own `role`
  (many orgs forbid IaC creating IAM), `tags` and `logRetention`.
- **Layer 2 — `IntakeStack.deploy()`**, a thin Pulumi Automation API wrapper
  over Layer 1 for users who want batteries included. It is a consumer of
  the component, not a parallel implementation.

**The neutral resource spec is an internal IR, never a user-facing API.**
Pulumi tried the cross-cloud abstraction as `@pulumi/cloud` and archived it
in December 2024: users "were broadly not satisfied", and cloud-neutrality
"led to severe limitations for users working in AWS". The kinds
(`function`, `httpEndpoint`, `containerService`, `schedule`, `secret`) are
almost exactly that surface, so two rules keep the IR from repeating the
mistake: it never appears in a user's type signature, and it is frozen by
intake's needs rather than grown toward cloud parity.

With `poll` dispatch, an intake deployment uses only `function`,
`httpEndpoint`, `schedule` and `secret` — all four have honest equivalents
on AWS, GCP, Azure and Cloudflare. `containerService` is the leaky kind (ECS
Fargate vs Cloud Run vs Container Apps, with no Workers equivalent at all)
and is required only by `changeStream` dispatch, which is why polling is the
default.

**Deploy state is not pipesafe's business.** A user deploying from their own
program already has a state backend. Runtime state — the envelope ledger,
leases, resume tokens — stays in MongoDB unconditionally; that is the
opinionated part and it is orthogonal to who owns the deploy. Layer 2 needs
somewhere to keep a stack checkpoint and a deploy lock, which is what
`StateStoreOptions` is for; it is an option of one path, not a principle.

**Secrets** — `secret(name)` returns a `SecretRef` (name only). Values come
from deploy options or `process.env` at deploy time and land in the provider
secret store; runtime resolves lazily and caches warm.

**Bundling** — the module that default-exports the `IntakeStack` is the
deployment unit: `deploy()` imports it to compute the plan, then
esbuild-bundles it with thin runtime shims that route work by name.
Constraints: module-scope closures only; no inline secrets (deploy-time scan
warns); import-side-effect-safe.

## The Stripe example, end to end

See [`examples/stripe-replica.ts`](./examples/stripe-replica.ts) for the
compiled version. In outline:

```ts
const stripe = new Webhook<"stripe", StripeEvent>({
  name: "stripe",
  path: "/webhooks/stripe",
  verify: verifiers.stripe(secret("STRIPE_SIGNING_SECRET")),
  eventId: (body) => body.id,
});

const customers = new Intake({
  name: "stripe_customers",
  batch: {
    handler: async function* (scope, ctx) {
      /* list customers changed since scope.window?.from */
    },
    schedules: [
      { cron: "*/5 * * * *", lookback: "1h" },
      { cron: "0 3 * * *", lookback: "7d" },
      { cron: "0 4 * * 0" },
    ],
  },
  event: {
    webhook: stripe,
    filter: (e) => e.body.type.startsWith("customer."),
    identifiers: (e) => [e.body.data.object.id],
    handler: async function* (scope, ctx) {
      /* fetch exactly scope.identifiers; ctx.delete(id) on 404 */
    },
  },
  rateLimit: { requestsPerSecond: 5 },
  output: {
    collection: "stripe_customers",
    key: "id",
    version: "updated",
    deletes: { mode: "soft", sweep: true },
  },
});

export default new IntakeStack({
  name: "acme",
  webhooks: [stripe],
  intakes: [customers],
  mongoUri: secret("MONGODB_URI"),
});

// manifold side: Intake.output is a Source<StripeCustomer & IntakeMeta>
const dimCustomers = new Model({
  name: "dim_customers",
  from: customers.output,
  pipeline: (p) => p.match({ livemode: true, _deletedAt: null }),
  materialize: { type: "collection", mode: Model.Mode.Upsert },
});
```

Intake owns "external data into Mongo, converged"; manifold owns "transform
what's in Mongo" — and because both sides speak `Source<T>`, a future
unified orchestrator can compose the whole graph.

## Type-safety scope

Intake is runtime-flavored; the promise is **generic flow, not validation**:
`TEvent` flows webhook → envelope → event `filter`/`identifiers`; `TDoc`
flows BOTH handlers → `output.key`/`output.version` (`keyof TDoc & string`)
→ `Collection<TDoc & IntakeMeta>` → manifold inference. Each handler
receives its own scope arm, so it never narrows something that cannot vary.
Literal `TName` generics mirror Model's. Payload types are user-supplied
(e.g. Stripe's published typings); runtime body validation is an explicit
non-goal for the MVP. `src/index.typeAssertions.ts` pins the generic flow
per repo convention.

## Roadmap

| Phase                             | Scope                                                                                                                                                                                                         | Acceptance                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0 (this PR)**                   | infra + intake scaffolds, this document                                                                                                                                                                       | build, lint, `typecheck:packages` green                                                                                                                                                                                                                                                                                                                                                                                                |
| **1 — local runtime**             | envelope ledger ops, verifier implementations, gateway/runner code paths, scope resolution (lookback → dates), the idempotent writer (natural-key upsert + version guard + `ctx.delete`), `dev()`, `replay()` | Stripe-shaped integration test on `useMemoryMongo`: signed POST → envelope → dispatch → event run (mock API) → typed upsert; duplicate-delivery test proves effectively-once; coalescing test proves N envelopes for R resources produce ONE run with R identifiers; out-of-order test proves the version guard rejects a stale write; scope-equivalence test proves a batch window run and an event run converge on the same document |
| **2 — cadence & convergence**     | schedule firing, `overlap` leases, sweeper logic, delete application (explicit + `sweep`)                                                                                                                     | kill-runner-mid-flight test shows lease-expiry redelivery without double-processing; sweep test proves a document absent from an unbounded run is soft-deleted and a bounded run never sweeps                                                                                                                                                                                                                                          |
| **3 — Pulumi + AWS (MVP deploy)** | infra: Layer 0 runtime handler factories, the AWS `ComponentResource` (Layer 1) with transforms/`nodes`/BYO provider+VPC+role, then `deploy()` as the Automation API wrapper (Layer 2); esbuild bundling      | Stripe example deploys to clean AWS from scratch against ANY replica-set MongoDB; the SAME component deploys from a user's own Pulumi program with their own state backend; live event lands; `plan()` on unchanged config is all no-ops; `teardown()` leaves nothing; **no ingestion concepts in infra's API**                                                                                                                        |
| **4 — hardening**                 | `status()` with ledger stats, `ctx.paginate`, `ctx.checkpoint` (mid-run resumption as a pure optimization), DLQ ops tooling, API Gateway/custom domains                                                       | a 500-page backfill resumes after a forced kill without re-reading completed pages; ops runbook                                                                                                                                                                                                                                                                                                                                        |

## Deferred work

- **Core: `$exists: false` narrows to `never` on any declared field.**
  Unrelated to intake's own surface (the soft-delete filter idiom is
  `{ _deletedAt: null }`, which typechecks), but a real pre-existing core
  bug worth fixing on its own: `FieldMatchingInterim`
  (packages/core/src/stages/match.ts) routes a declared key through
  `ExpectedValue`, which returns `unknown` for `$exists: false`, and
  `unknown` extends no field type, so `FilterUnion` drops the member. Its
  `Query[K] extends { $exists: false } ? true` arm sits in the
  not-a-field-selector branch and so only ever fires for keys absent from
  the schema.
- **`ctx.checkpoint()` for mid-run resumption.** A long paginated batch run
  that dies today re-runs its whole window — correct, because idempotent,
  but expensive against a shared rate budget. Deferrable precisely because
  principle 2 makes it an optimization with no semantic effect.
- **Event-driven manifold, the full design.** The `ChangeSubscription` +
  dispatch scaffold in `packages/manifold/src/events/` is deliberately
  minimal and is now manifold's own concern: intake no longer depends on it.
  The real design pass covers incremental/reactive Model refresh,
  subscription placement in the Project DAG, typed change-event schemas, and
  how batch and event-driven execution compose in one graph.
- **Atlas Triggers** as a `changeStream` dispatch implementation, letting
  Atlas users drop the watcher container. Context: Atlas App Services
  reached EOL (Sept 2025) but database triggers were explicitly retained.
- **Second cloud provider** (Cloudflare Workers component) — reachable
  precisely because `poll` dispatch avoids `containerService`.
- **Connector-platform interop.** Auth and provider catalogs are a different
  product (Nango and friends do OAuth, token refresh and hundreds of
  pre-built providers). A batch handler reading such a platform's records
  API, or a `Webhook` accepting its outbound webhooks, gives intake that
  catalog without building it. Per-customer OAuth is explicitly NOT intake's
  job.
- **Manifold on infra** — scheduled materialization deployment; the step
  that realizes the single ingestion→analytics DAG.

## Risks

- **Convergence depends on the batch route being declared well.** An intake
  whose only schedule is a narrow lookback will silently never converge on
  deletions or on records the API back-dated. Validation should warn when
  `deletes.sweep` is set but no unbounded schedule exists.
- **Shared rate budgets**: many APIs rate limit **per account across all
  consumers**, not per app — an intake cannot assume it has the documented
  limit to itself (e.g. a 200 req/min account ceiling already shared with an
  incumbent polling pipeline leaves real headroom well below the docs).
  `rateLimit` is the intake's _share_, set by the operator; deploying
  alongside an existing pipeline means coordinating with or replacing it.
- **Unbounded sweeps are expensive.** A weekly full sweep of a large entity
  can dwarf every other run combined. Document the cost and make the cadence
  a deliberate choice.
- **`pulumi` CLI** is a deploy-time prerequisite for Layer 2 (not a runtime
  one, and not needed at all for Layer 0 or Layer 1).
- **Mongo access from FaaS**: Atlas IP allowlisting (MVP: documented
  tradeoffs; PrivateLink later) and connection caps under concurrency —
  small `maxPoolSize`, reserved-concurrency guidance. `concurrencyLimit` is
  the intake-side lever.
- **Cold starts** on the gateway ack path (~1–2 s with driver + TLS): keep
  bundles small, nothing but the insert on the hot path.
- **Payload limits**: ~6 MB sync function request; 16 MB Mongo document
  ceiling (GridFS escape hatch out of MVP).
- **Credential scoping**: ship copy-pasteable least-privilege IAM policies
  (deployer + runtime), name-scoped to `pipesafe-intake-*`.
