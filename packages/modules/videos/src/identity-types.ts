/**
 * N0VA VIDEOS — Consent-Aware Identity Types
 * First-class Identity Rights Registry governing face/voice/body/likeness
 */

export type IdentityStatus = "verified" | "pending" | "unverified";
export type GrantStatus = "active" | "revoked" | "expired" | "pending";

export type PermissionDomain = "face" | "voice" | "body_motion" | "likeness";

export type Permissions = {
  face_detection: boolean;
  face_recognition: boolean;
  face_tracking: boolean;
  face_generation: boolean;
  voice_transcription: boolean;
  voice_cloning: boolean;
  voice_conversion: boolean;
  lip_sync: boolean;
  synthetic_presenter: boolean;
  body_motion_transfer: boolean;
  likeness_transfer: boolean;
};

export type ConsentGrant = {
  grant_id: string;
  status: GrantStatus;
  consent_version: string; // v3.2
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
  territories: string[]; // IN, US, GB
  projects: string[];
  platforms: string[]; // youtube, linkedin
  permissions: Permissions;
  required_disclosure: {
    required: boolean;
    language: string;
    text: string;
    placement: string;
    minimum_duration_ms: number;
  };
  source_evidence: string[]; // evidence ids
  approved_by: string[];
};

export type PersonIdentity = {
  person_id: string;
  display_name: string; // Encrypted Person Name
  identity_status: IdentityStatus;
  identity_methods: string[]; // government_verified, agency_verified
  consent_grants: ConsentGrant[];
  created_at: string;
};

export type ConsentEvidence = {
  evidence_id: string;
  type: "signed_release" | "contract_clause" | "consent_recording" | "esignature" | "agency_authorization";
  storage_uri: string; // vault://consent/...
  content_hash: string; // sha3-512
  signed_at: string;
  signatory_verified: boolean;
  verification_method: string; // qualified_esignature
  retention_policy: string; // legal_compliance_20_years
  access_policy: string; // legal_and_consent_admins_only
};

export type ConsentDimension = {
  identity: string; // person_id
  modality: PermissionDomain;
  action: "detect" | "recognize" | "clone" | "transform" | "generate" | "publish";
  project: string;
  territory: string;
  platform: string;
  audience: "internal" | "private_review" | "public" | "paid_media";
  duration: { start: string; expiry: string };
  disclosure: string;
  derivatives: boolean;
  commercial_use: boolean;
};

export type ConsentDecision = {
  decision: "allowed" | "allowed_with_disclosure" | "allowed_for_review_only" | "allowed_with_human_approval" | "denied" | "expired" | "revoked" | "scope_mismatch" | "evidence_missing" | "identity_unverified" | "policy_conflict" | "uncertain_identity";
  person_id: string;
  operation: string; // voice_clone, face_generation, etc.
  project_id: string;
  territory: string;
  platform: string;
  audience: string;
  evaluated_at: string;
  grant_id?: string;
  disclosure_required?: boolean;
  evidence_required?: boolean;
  reason?: string;
};

export type FaceProcessingPolicy = {
  unknown_faces: "blur_on_public_export" | "block" | "allow";
  known_faces_without_scope: "do_not_index" | "blur";
  embedding_retention: "project_lifetime" | "session" | "permanent";
  cross_project_search: "consent_required" | "allow";
  cross_tenant_matching: boolean;
  public_export_without_consent: "block" | "blur" | "allow";
};

export type VoicePermission = {
  voice_id: string;
  source_person_id: string;
  allowed_operations: string[]; // internal_dubbing
  prohibited_operations: string[]; // political_content
  allowed_languages: string[]; // en-IN, hi-IN
  max_duration_per_project_seconds: number;
  disclosure_required: boolean;
};

export type SyntheticPresenterPolicy = {
  presenter_id: string;
  face_grant: string;
  voice_grant: string;
  likeness_grant: string;
  allowed_content_types: string[]; // product_education
  prohibited_content_types: string[]; // political
  required_disclosure: boolean;
  human_approval_required: boolean;
};

export type DisclosurePolicy = {
  required: boolean;
  methods: string[]; // opening_card, description_metadata, platform_ai_label
  opening_card?: { text: string; duration_ms: number; minimum_contrast_ratio: number };
  languages?: Record<string, string>;
};

export type IdentityProvenance = {
  output_id: string;
  asset_hash: string;
  timeline_version: string;
  generated_operations: {
    operation: string;
    person_id: string;
    grant_id: string;
    model_id: string;
    model_version: string;
    input_assets: string[];
    time_range: { start_ms: number; end_ms: number };
  }[];
  consent_snapshot: {
    policy_version: string;
    evaluated_at: string;
    grant_status: string;
    evidence_hashes: string[];
  };
  disclosure: { required: boolean; applied: boolean; disclosure_asset_id?: string };
  signature: string; // dilithium
};

export type ConsentPassport = {
  person_id: string;
  display_name: string;
  operations: string[]; // Voice cloning, lip-sync
  project: string;
  territories: string[];
  platforms: string[];
  consent_status: string;
  expires: string;
  disclosure: string;
  evidence: string; // Verified signed release
  generated_by: string; // N0VA Voice 5.2.1
  revocation_status: string;
};

export type RevocationEvent = {
  event_type: "identity.consent.revoked";
  event_id: string;
  person_id: string;
  grant_id: string;
  effective_at: string;
  scope: { operations: string[]; projects: string[]; territories: string[]; platforms: string[] };
  reason_code: string;
  required_actions: string[];
};

export type RevocationPropagationStatus = {
  event_id: string;
  total: number;
  completed: string[];
  pending: string[];
  progress: string; // 8/10 complete
};

export type ExportConsentGate = {
  export_id: string;
  result: "allowed" | "blocked";
  checks: { check: string; result: "pass" | "expired" | "missing" | "incomplete" | "failed"; range?: string }[];
  blocking_reasons: string[];
};

export type AgentConsentToken = {
  agent_id: string;
  person_id: string;
  allowed_operations: string[];
  project_id: string;
  territories: string[];
  expires_at: string;
  single_use: boolean;
  audit_required: boolean;
  token_id: string;
};

export type IdentityCandidate = {
  person_id: string;
  confidence: number;
  scope_match: boolean;
};
