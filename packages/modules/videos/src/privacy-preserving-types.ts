/**
 * N0VA VIDEOS — Privacy-Preserving Processing Types
 * Non-destructive, policy-controlled, auditable
 */

export type PrivacyState = "raw_restricted" | "internal_privacy_processed" | "external_safe" | "public_safe" | "legal_hold" | "deletion_pending" | "deleted_verified";
export type PrivacyDetector = "faces" | "license_plates" | "ocr_pii" | "speech_pii" | "medical_data" | "financial_data" | "voice_identity" | "medical" | "financial";
export type TransformationType = "face_blur" | "license_plate_blur" | "document_redaction" | "voice_anonymization" | "adaptive_pixelation" | "opaque_mask" | "gaussian_blur";

export type PrivacyAsset = {
  asset_id: string;
  source_asset_id: string;
  privacy_state: PrivacyState;
  transformations: TransformationType[];
  policy_id: string;
  review_status: "pending" | "approved" | "rejected";
  approved_by?: string;
  approved_at?: string;
  created_at: string;
};

export type FacePrivacyRule = {
  default: string;
  known_subjects: Record<string, string>;
  tracking: { minimum_detection_confidence: number; maximum_untracked_frames: number; reidentification_check: boolean };
  review_required_if: string[];
};

export type PlatePrivacyEvent = {
  event_id: string;
  vehicle_track_id: string;
  time_range: { start_ms: number; end_ms: number };
  detected_region: { x: number; y: number; width: number; height: number };
  transformation: string;
  confidence: number;
  reveal_check: string;
};

export type DocumentRedaction = {
  event_id: string;
  time_range: { start_ms: number; end_ms: number };
  region: { x: number; y: number; width: number; height: number };
  detected_entities: { type: string; confidence: number }[];
  method: string;
  post_render_verification: string;
};

export type VoicePrivacy = {
  source_speaker_id: string;
  mode: "low_transformation" | "moderate_transformation" | "high_transformation" | "full_anonymization";
  preserve: string[];
  remove: string[];
  reidentification_risk: number;
  quality_score: number;
  review_required: boolean;
};

export type SpeechPiiFinding = {
  range: { start_ms: number; end_ms: number };
  speaker_id: string;
  entity_type: string;
  confidence: number;
  action: string;
  replacement_text: string;
  review_status: string;
};

export type PrivacyScore = {
  detection_confidence: number;
  classification_confidence: number;
  transformation_coverage: number;
  residual_exposure_risk: number;
  reidentification_risk: number;
  overall_status: "pass" | "pass_with_review" | "blocked" | "escalate";
};

export type RetentionPolicy = {
  policy_id: string;
  region: string;
  asset_classes: Record<string, { retention: string; basis: string }>;
  legal_hold_override: boolean;
};

export type EmbeddingLineage = {
  embedding_id: string;
  source_asset_id: string;
  source_ranges: { start_ms: number; end_ms: number }[];
  embedding_type: string;
  stores: string[];
  deletion_status: "active" | "pending" | "deleted" | "verified";
};

export type DeletionCertificate = {
  request_id: string;
  asset_id: string;
  requested_at: string;
  deleted_components: string[];
  replicas_checked: string[];
  cache_invalidation: string;
  key_destruction: string;
  verification_method: string;
  status: "verified" | "pending" | "failed";
  evidence_hashes?: { pre_manifest: string; post_manifest: string };
};

export type ExternalShareReview = {
  destination: string;
  recipient_domain: string;
  asset_id: string;
  findings: {
    faces: { detected: number; unconsented: number; status: string };
    license_plates: { detected: number; redacted: number; status: string };
    speech_pii: { detected: number; redacted: number; status: string };
    ocr_pii: { detected: number; status: string };
    embeddings: { external_inclusion: boolean; status: string };
  };
  decision: "allow" | "blocked" | "review_required";
  required_actions: string[];
};

export type PolicyDefinition = {
  policy_id: string;
  version?: number;
  name: string;
  scope: { regions: string[]; destinations: string[] };
  require: string[];
  prohibit: string[];
  retention: Record<string, string>;
  privacy: { blur_unknown_faces: boolean; blur_license_plates: boolean; redact_medical_data: boolean; redact_financial_data: boolean; anonymize_sensitive_voices: string };
  approval: { external_share: { required_roles: string[] }; unwatermarked_export: { required_roles: string[] } };
};

export type PolicyContext = {
  event: string;
  tenant_id: string;
  asset_id: string;
  principal_id: string;
  region: string;
  destination: string;
  asset_classification: string;
  privacy_state: string;
  consent_status: string;
  caption_status: string;
  copyright_status: string;
  brand_status: string;
  requested_actions: string[];
};

export type PolicyDecision = {
  decision_id: string;
  policy_id: string;
  event: string;
  decision: "allow" | "deny";
  reason_codes: string[];
  required_actions: string[];
  evaluated_at: string;
  expires_at: string;
};

export type PrivacyDashboardMetrics = {
  assets_under_processing: number;
  external_share_pending: number;
  unconsented_faces: number;
  unredacted_pii: number;
  voice_reviews: number;
  embeddings_pending_deletion: number;
  deletion_certificates: number;
  replica_verifications_pending: number;
  failed_policy_tests: number;
  blocked_assets: number;
  retention_expiries_30d: number;
};
