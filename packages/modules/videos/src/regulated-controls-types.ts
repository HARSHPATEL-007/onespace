/**
 * N0VA VIDEOS — Regulated Controls Types (Healthcare / Legal / Finance)
 * Every regulated decision explainable and auditable.
 */
export type RegulatedDomain = "healthcare" | "legal" | "finance" | "public_sector";
export type HoldStatus = "active" | "released" | "expired";
export type RetentionClass = "standard" | "legal_hold" | "worm" | "evidence";

export interface LegalHold {
  hold_id: string;
  tenant_id: string;
  project_id?: string;
  asset_id?: string;
  domain: RegulatedDomain;
  reason: string;
  status: HoldStatus;
  custodian?: string;
  matter_id?: string;
  expires_at?: string;
  created_at: string;
  provenance: { actor: string; correlation_id: string; policy_version: string };
}

export interface RetentionPolicy {
  policy_id: string;
  tenant_id: string;
  domain: RegulatedDomain;
  retention_class: RetentionClass;
  days: number;
  worm: boolean;
  disposition_requires_approval: boolean;
  data_residency?: string;
  created_at: string;
}

export interface RegulatedAudit {
  audit_id: string;
  tenant_id: string;
  domain: RegulatedDomain;
  action: string;
  asset_id?: string;
  actor: string;
  decision: string;
  policy_version: string;
  explainable: boolean;
  timestamp: string;
}
