/**
 * N0VA VIDEOS — Event-Driven Architecture Types
 * Tenant-isolated, durable, idempotent, replayable
 */

export type EventEnvelope = {
  id: string; // evt_01JZ...
  type: string; // video.asset.ingested
  source: string; // n0va.videos.ingestion
  subject: string; // asset:asset_001
  time: string;
  tenant: { id: string; region: string; classification: string };
  project: { id: string; version: number };
  entity: { type: string; id: string; version: number };
  causation_id: string;
  correlation_id: string;
  trace_id: string;
  actor: { id: string; type: string; role: string; authentication: string };
  idempotency_key: string;
  schema: { name: string; version: string };
  data_classification: string;
  policy_decision_id?: string;
  occurred_at: string;
  published_at: string;
  data: Record<string, unknown>;
};

export type EventTaxonomy = `video.${string}.${string}`;

export type OutboxRecord = {
  outbox_id: string;
  event_id: string;
  tenant_id: string;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: number;
  event_type: string;
  payload: EventEnvelope;
  status: "pending" | "published" | "failed";
  attempts: number;
  next_attempt_at: string;
};

export type WorkflowState = {
  workflow_id: string;
  type: string; // client_delivery
  correlation_id: string;
  state: string;
  steps: { name: string; status: string; event_id?: string }[];
  compensation: string[];
};

export type WebhookSubscription = {
  subscription_id: string;
  tenant_id: string;
  event_types: string[];
  destination_url: string;
  signing_key: string;
  redacted_fields: string[];
  status: "active" | "paused" | "revoked";
};

export type DeadLetter = {
  event_id: string;
  consumer: string;
  failure_code: string;
  attempts: number;
  first_failed_at: string;
  last_failed_at: string;
  safe_to_replay: boolean;
  required_action: string;
};

export type ProjectionState = {
  projection: string;
  last_event_id: string;
  last_aggregate_version: number;
  last_schema_version: string;
  rebuilt_at: string;
  error?: string;
};

export type SchemaDefinition = {
  name: string;
  version: string;
  compatibility: "backward" | "forward" | "full" | "none";
  required: string[];
  classifications: Record<string, string>;
};
