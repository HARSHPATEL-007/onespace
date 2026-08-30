/**
 * N0VA VIDEOS — Multimodal Knowledge Graph Types
 * Embeddings discover candidates. Graph proves context with evidence, time, and provenance.
 */

export type EntityType =
  | "VideoProject" | "VideoAsset" | "TimelineVersion" | "Scene" | "Export"
  | "Person" | "Object" | "Location" | "Product" | "ProductVariant"
  | "Event" | "ShootEvent" | "DialogueTopic" | "Claim" | "Document" | "Campaign"
  | "CRMRecord" | "CRMAccount" | "CRMContact" | "CRMOpportunity"
  | "CalendarEvent" | "LegalMatter" | "ConsentRecord" | "ReviewDecision" | "ReviewItem" | "Blocker";

export type RelationshipType =
  | "CONTAINS" | "HAS_VERSION" | "BELONGS_TO" | "LINKED_TO" | "SCHEDULED_BY" | "BASED_ON" | "INCLUDES"
  | "APPEARS_IN" | "SPEAKS_IN" | "DEPICTS" | "MENTIONS" | "FILMED_AT" | "LOCATED_IN"
  | "DERIVED_FROM" | "GOVERNED_BY" | "AUTHORIZED_BY" | "REQUIRES" | "REVIEWED_BY" | "APPROVED_BY"
  | "BLOCKS" | "SUPERSEDES" | "CONTRADICTS" | "SUPPORTS" | "REFERENCES" | "INFLUENCED_BY"
  | "EXPORTED_AS" | "PUBLISHED_TO" | "EXPIRES_ON" | "AFFECTED_BY" | "PRODUCES" | "PART_OF"
  | "HAS_CONSENT" | "SUBJECT_TO" | "USES_PACKAGING" | "CONTAINS_CLAIM" | "ABOUT" | "SUPPORTED_BY"
  | "DUE_AT" | "FOR_PROJECT" | "HAS_BLOCKER" | "PUBLISHED_BY" | "SCHEDULED_FOR" | "CREATED_BY" | "AFFECTS" | "VERIFIED_IN";

export type TrustLevel = "confirmed" | "imported" | "machine_inferred" | "similarity_inferred" | "contradicted" | "stale";
export type VerificationStatus = "machine_generated" | "human_reviewed" | "policy_approved" | "contradicted";

export type TemporalInterval = { start_ms?: number; end_ms?: number; start_at?: string; end_at?: string | null };
export type MediaInterval = { asset_id: string; start_ms: number; end_ms: number; frame_ranges?: [number, number][] };
export type ValidityInterval = { start_at: string; end_at: string | null };

export type GraphNode = {
  node_id: string;
  tenant_id: string;
  type: EntityType;
  canonical_label: string;
  aliases?: string[];
  source_refs: { system: string; id: string; path?: string }[];
  embeddings?: { multimodal_ref?: string; visual_ref?: string; audio_ref?: string; text_ref?: string };
  attributes: Record<string, unknown>;
  privacy?: { pii_class?: "restricted" | "confidential" | "public"; consent_required?: boolean; face_embedding_ref?: string };
  access_policy?: { classification: "public" | "confidential" | "restricted"; allowed_roles: string[] };
  provenance: { created_by: string; model_version?: string; confidence?: number; human_verified: boolean; created_at: string; updated_at: string };
  validity?: ValidityInterval;
  expires_at?: string | null;
};

export type GraphEdge = {
  edge_id: string;
  from_node: string;
  type: RelationshipType;
  to_node: string;
  media_interval?: MediaInterval;
  validity?: ValidityInterval;
  observed_at: string; // system time
  confidence: number;
  evidence_refs: string[];
  evidence?: { asset_id?: string; start_ms?: number; end_ms?: number; frame_ranges?: [number, number][]; model?: string; transcript_segment_id?: string };
  verification: { status: VerificationStatus; verified_by?: string | null; verified_at?: string };
  trust_level: TrustLevel;
  provenance_chain?: string[];
  sensitivity?: "low" | "medium" | "high";
  tenant_id: string;
};

export type GraphConflict = {
  conflict_id: string;
  edge_ids: string[];
  description: string;
  sources: { system: string; value: string; effective_at: string }[];
  detected_at: string;
  status: "open" | "resolved";
  resolution?: { resolved_by: string; resolved_at: string; chosen_source: string };
  review_item_id?: string;
  blocks_publish: boolean;
};

export type EntityMatch = {
  match_id: string;
  left: string;
  right: string;
  match_type: "authoritative_id" | "visual_fingerprint" | "name_alias" | "context";
  confidence: number;
  status: "candidate" | "confirmed" | "rejected";
};

export type PolicyCheck = {
  check_id: string;
  node_id: string;
  publishable: boolean;
  reasons: string[];
  details: { valid_consent: boolean; authorized_claims: boolean; brand_usage: boolean; no_legal_hold: boolean; review_complete: boolean; destination_policy: boolean };
  traversed_path: string[];
};

export type HybridSearchResult = {
  result_id: string;
  node_id: string;
  score: number;
  why_matched: string[];
  evidence: { frames?: string[]; transcript_ranges?: string[]; documents?: string[] };
  path: string[];
  trust: TrustLevel;
};
