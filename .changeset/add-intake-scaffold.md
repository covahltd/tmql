---
"@pipesafe/infra": minor
"@pipesafe/intake": minor
"@pipesafe/manifold": minor
---

Scaffold the intake replication framework, the shared infra engine, and
manifold's event-driven foundation: package skeletons, public type surfaces
(Webhook/Intake/IntakeScope/IntakeEnvelope/IntakeStack;
InfraProvider/PulumiBackend/SecretRef; ChangeSubscription/DispatchConfig),
and the architecture design doc (packages/intake/ARCHITECTURE.md).

An `Intake` is one idempotent replication unit per external entity, so it is
a reconciliation job by nature: backfill, incremental sync, gap recovery and
replay are the same unit invoked with different scopes, at any cadence. It
has a mandatory scheduled batch route and an optional webhook-driven event
route, both landing the same document type under the same natural key.
Intake dispatches its own event runs from the envelope ledger and therefore
does not depend on manifold. Type-level only - no runtime yet.
