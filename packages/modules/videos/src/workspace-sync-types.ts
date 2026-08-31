/**
 * N0VA VIDEOS — Workspace Sync Types (Cross-Module Synchronization)
 * Every workflow synchronized, every decision explainable.
 */
export type SyncEntity = "project" | "asset" | "timeline" | "review" | "task" | "calendar" | "chat" | "approval";
export type SyncStatus = "pending" | "synced" | "conflict" | "blocked_policy" | "failed";
export type ConflictStrategy = "last_write_wins" | "manual_merge" | "policy_veto";

export interface SyncLink {
  link_id: string;
  tenant_id: string;
  source: { module: string; entity: SyncEntity; id: string };
  target: { module: string; entity: SyncEntity; id: string };
  status: SyncStatus;
  last_synced_at?: string;
  conflict?: { strategy: ConflictStrategy; reason: string; requires_human: boolean };
  provenance: { actor: string; correlation_id: string; policy_version: string };
}

export interface WorkspaceSyncState {
  project_id: string;
  tenant_id: string;
  links: SyncLink[];
  crdt_clock: Record<string, number>;
  pending_events: number;
  conflicts: number;
  last_sync_at: string;
}

export interface SyncPolicy {
  allow_cross_module_write: boolean;
  require_approval_for: SyncEntity[];
  conflict_strategy: ConflictStrategy;
  audit_every_link: boolean;
}
