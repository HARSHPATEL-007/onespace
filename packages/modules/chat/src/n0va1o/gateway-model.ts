/**
 * Unified Gateway Model — single policy and transport layer between N0VA CHAT and externals
 * Standardizes auth, retries, mapping, quotas once; exposes via connector adapters
 *
 * Core capabilities:
 * - Authentication orchestration
 * - Token lifecycle management
 * - Schema normalization
 * - Rate-limit mediation
 * - Delivery guarantees
 * - Audit and observability
 */

export const GATEWAY_CAPABILITIES = [
  "authentication_orchestration",
  "token_lifecycle_management",
  "schema_normalization",
  "rate_limit_mediation",
  "delivery_guarantees",
  "audit_and_observability",
] as const;

export const GATEWAY_RULE = "Make every external integration go through the gateway, never directly from the chat service.";

export interface ConnectorRecord {
  connector_id: string;
  provider: string;
  status: "production" | "beta" | "planned";
  auth: {
    type: "oauth2" | "api-key" | "webhook";
    token_state: "valid" | "expired" | "refreshing" | "revoked";
    refresh_scheduled_at: string | null;
  };
  mode: "bidirectional" | "inbound" | "outbound" | "relay";
  rate_limit: {
    policy: "token_bucket";
    remaining: number;
    reset_at: string;
  };
  transform: {
    schema_version: string;
    canonical_object: "contact" | "message" | "task" | "event" | "invoice" | "ticket";
  };
  // extended governance fields
  data_residency?: string;
  reliability_tier?: "tier1" | "tier2" | "tier3";
}

export function exampleConnectorRecord(): ConnectorRecord {
  return {
    connector_id: "slack_prod_01",
    provider: "slack",
    status: "production",
    auth: {
      type: "oauth2",
      token_state: "valid",
      refresh_scheduled_at: "2026-08-12T10:55:00Z",
    },
    mode: "bidirectional",
    rate_limit: {
      policy: "token_bucket",
      remaining: 124,
      reset_at: "2026-08-12T11:00:00Z",
    },
    transform: {
      schema_version: "v3",
      canonical_object: "message",
    },
    data_residency: "us",
    reliability_tier: "tier1",
  };
}

/**
 * Totp: event-driven pipeline stages — ingestion → normalization → dispatch
 * Never let one broken connector block the entire gateway
 */
export const PIPELINE_STAGES = ["ingestion", "normalization", "dispatch"] as const;

export function pipelineStageFor(action: string): (typeof PIPELINE_STAGES)[number] {
  if (action.startsWith("fetch") || action === "unfurl" || action === "ingest") return "ingestion";
  if (action.includes("normalize") || action.includes("transform")) return "normalization";
  return "dispatch";
}
