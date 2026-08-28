/**
 * N0VA VIDEOS — Production-Grade Provenance Types
 * Cryptographically verifiable chain of custody: frame → segment → asset → timeline → render → export → publication
 * Principles: every pixel/sample/caption/decision traceable to authorized source+transformation
 */

export type EntityType =
  | "original_camera_file" | "proxy" | "audio_stem" | "transcript" | "caption_file"
  | "face_embedding" | "voice_profile" | "generated_shot" | "timeline" | "timeline_version"
  | "render" | "export" | "thumbnail" | "metadata_package" | "approval" | "consent_record"
  | "external_object";

export type ActivityType =
  | "ingest" | "transcode" | "trim" | "crop" | "color_grade" | "noise_reduction"
  | "face_blur" | "face_replace" | "voice_synthesis" | "dubbing" | "lip_sync" | "frame_interpolation"
  | "background_replace" | "caption_generation" | "render" | "upload" | "publish" | "archive" | "delete";

export type AgentType = "human_operator" | "n0va_agent" | "model" | "plugin" | "external_service" | "n0va10_connector" | "rendering_worker" | "approval_authority";

export type ProvenanceEntity = {
  entity_id: string;
  entity_type: EntityType;
  created_at: string;
  hash: string; // sha3-512
  metadata?: Record<string, unknown>;
  tenant_id: string;
  project_id: string;
};

export type ProvenanceActivity = {
  activity_id: string;
  activity_type: ActivityType;
  started_at: string;
  ended_at?: string;
  operation?: string; // e.g. background_replace
};

export type ProvenanceAgent = {
  agent_id: string;
  agent_type: AgentType;
  display_name: string;
  model_version?: string;
  tool_version?: string;
};

export type ProvenanceAssociation = {
  association_id: string;
  activity_id: string;
  input_entity_ids: string[];
  output_entity_ids: string[];
  agent_id: string;
  human_principal?: string; // user_204 accountable
  model_version?: string;
  prompt_record_id?: string;
  policy_id?: string;
  capability_token_id?: string;
  approval_id?: string;
  consent_id?: string;
};

export type LineageResolution = "project" | "timeline" | "segment" | "frame" | "sample" | "metadata_field";

export type SegmentLineage = {
  lineage_id: string;
  timeline_id: string;
  segment: { start_frame: number; end_frame: number; start_timecode: string; end_timecode: string };
  source_entities: { asset_id: string; source_range: { start_frame: number; end_frame: number } }[];
  transformation: { operation: string; region_mask?: string; change_class: "synthetic_visual_alteration" | "color_transform" | "audio_transform" | "metadata_update" | "identity_transform" };
  activity_id: string;
  output_hash: string;
  lineage_status: "verified" | "pending" | "broken";
};

export type IntegrityHashes = {
  file_hash: string;
  decoded_media_hash: string;
  frame_merkle_root: string;
  audio_merkle_root: string;
  metadata_hash: string;
  timeline_hash: string;
  provenance_root: string;
};

export type GenerationRecord = {
  generation_id: string;
  output_asset_id: string;
  operation: string; // voice_synthesis, background_replace, etc.
  model: { provider: string; name: string; version: string; model_digest: string };
  prompt_record: {
    system_prompt_hash: string;
    user_prompt_ciphertext: string; // encrypted, hash visible
    user_prompt_redacted?: string;
    prompt_policy_version: string;
    parameters: Record<string, unknown>; // seed, sampler, guidance, resolution, etc.
  };
  inputs: { asset_id: string; role: string }[];
  consent_id?: string;
  operator: string; // user_204
  requesting_agent: string; // agent.video.dubbing.v2
  capability_token_id?: string;
  generation_timestamp: string;
  output_hash: string;
  moderation_result?: string;
  human_review?: string;
  disclosure_class: string; // synthetic_voice, background_replacement, etc.
  review_status?: string;
};

export type EditOperationRecord = {
  activity_id: string;
  activity_type: "timeline_edit";
  operation: string; // trim_and_color_grade
  inputs: string[]; // asset ids, lut ids
  outputs: string[]; // timeline_branch ids
  parameters: Record<string, unknown>;
  operator: { type: "agent" | "human"; id: string };
  human_originator: string;
  capability_token_id?: string;
  approval_id?: string | null;
  reversible: boolean;
  rollback_snapshot?: string;
  category: "structural_edit" | "visual_transform" | "audio_transform" | "synthetic_generation" | "identity_transform" | "metadata_transform" | "compliance_transform" | "distribution_transform";
};

export type TimelineEvent = {
  timeline_event_id: string;
  timeline_id: string;
  sequence: number;
  parent_event_hash: string; // hash-linked
  event_type: string; // clip_replace, etc.
  payload_hash: string;
  actor: string; // agent.video.autoeditor.v4
  human_principal: string;
  created_at: string;
  resulting_timeline_hash: string;
  snapshot_id: string;
  signature: string;
  branch?: string;
};

export type RenderRecipe = {
  render_recipe_id: string;
  timeline_hash: string;
  source_hashes: string[];
  render_engine: { name: string; version: string; container_digest: string };
  video: { codec: string; profile: string; width: number; height: number; frame_rate: number; color_pipeline: string; hdr?: string };
  audio: { codec: string; channels: number; sample_rate: number; target_loudness_lufs: number };
  caption_track_hashes: string[];
  watermark_config_hash: string;
  reproducibility_status: "locked";
  reproducibility_level?: "bit_identical" | "media_equivalent" | "process_reproducible";
  seeds?: Record<string, number>;
  plugin_manifests?: string[];
};

export type ExportManifest = {
  manifest_version: string; // n0va-provenance-1.0
  export_id: string;
  asset_hash: string; // final file
  decoded_media_hash: string;
  timeline_hash: string;
  provenance_root: string; // merkle
  source_assets: { asset_id: string; hash: string; usage: { start_timecode: string; end_timecode: string }[] }[];
  ai_operations: { activity_id: string; segment: string; classification: string }[];
  approvals: string[]; // apr_....
  consents: string[];
  render_recipe_id: string;
  destination: string; // youtube_private_draft, cdn, etc.
  publication_status?: string;
  disclosure_classifications: string[];
  signature: string;
  created_at: string;
  replicated_to?: string[]; // independent integrity store
};

export type C2PAAssertion = {
  assertion_type: string; // n0va.ai_transformation
  claim_generator: string; // N0VA VIDEOS
  operation: string;
  time_range?: { start_frame: number; end_frame: number };
  input_assets: string[];
  model?: string;
  human_reviewed: boolean;
  approved_by?: string;
  disclosure_required: boolean;
  content_type: "captured" | "edited" | "ai_generated" | "ai_assisted" | "synthetic_voice" | "synthetic_likeness" | "background_replacement" | "face_alteration" | "caption_generation" | "human_approval";
};

export type C2PACredential = {
  credential_id: string;
  asset_id: string;
  issuer: string;
  issued_at: string;
  assertions: C2PAAssertion[];
  signature: string;
  manifest_url?: string;
  lifecycle_point: "ingest" | "ai_generation" | "major_edit" | "final_render" | "export" | "external_publication" | "post_publication_correction";
};

export type ConsentProvenance = {
  consent_id: string;
  subject_id: string; // person_044
  identity_type: "voice" | "face" | "likeness";
  permitted_operations: string[]; // voice.generate, voice.dub
  purpose: string; // q3_product_campaign
  territories: string[]; // [IN,US,GB]
  languages: string[]; // [en,hi]
  destinations: string[]; // [review_portal, youtube]
  valid_from: string;
  valid_until: string;
  revoked_at: string | null;
  source_document_hash: string;
  verification_status: "verified" | "pending" | "revoked";
  disclosure_requirements?: string[];
};

export type ProvenanceHistoryEvent =
  | "proposal_created" | "evidence_assembled" | "policy_evaluated" | "approval_requested" | "approval_granted" | "approval_rejected"
  | "approval_expired" | "approval_invalidated" | "asset_changed" | "consent_renewed" | "consent_revoked" | "exception_issued" | "exception_expired";

export type ApprovalHistoryEntry = {
  event: ProvenanceHistoryEvent;
  at: string;
  by?: string;
  detail?: string;
};

export type RollbackPlan = {
  snapshot_id: string;
  internal_actions: string[]; // restore_timeline, restore_caption_track, revoke_review_link
  external_actions: string[]; // unpublish_youtube, replace_cdn_manifest, notify_owners
  rollback_status: "tested" | "pending" | "executed";
  compensating_required: boolean;
};

export type ExternalTransaction = {
  external_transaction_id: string;
  export_id: string;
  application: string; // youtube
  connector: string; // n0va10.youtube.v6
  operation: string; // upload_private
  external_object_id: string; // yt_abc123
  request_hash: string;
  response_hash: string;
  credential_subject: string; // channel_007
  status: "pending" | "reconciled" | "failed";
  content_manifest_id: string;
  timestamp: string;
  publication_state?: string;
  reconciliation_status?: string;
};

export type DisclosureLevel = "public_viewer" | "client" | "editor" | "auditor" | "legal_investigator";

export type VerificationCheck = {
  manifest_signature: "passed" | "failed";
  media_hash: "passed" | "failed";
  timeline_hash: "passed" | "failed";
  source_lineage: "passed" | "failed";
  approval_binding: "passed" | "failed";
  consent_at_generation: "passed" | "failed" | "not_applicable";
  c2pa_credential: "passed" | "failed" | "missing";
  external_publication_match: "passed" | "failed" | "not_applicable";
};

export type VerificationResponse = {
  verification_id: string;
  export_id: string;
  status: "verified" | "verified_with_disclosure" | "failed" | "unverified";
  checks: VerificationCheck;
  disclosures: string[]; // synthetic_voice, background_replacement
  broken_link?: string;
  verified_at: string;
};

export type ProvenanceCompleteness = {
  export_id: string;
  provenance_completeness: number; // 0-1
  critical_gaps: string[];
  release_status: "production_ready" | "allowed_with_warning" | "blocked";
  breakdown: Record<string, { present: boolean; score: number }>;
};

export type ProvenanceGraph = {
  entities: Map<string, ProvenanceEntity>;
  activities: Map<string, ProvenanceActivity>;
  agents: Map<string, ProvenanceAgent>;
  associations: Map<string, ProvenanceAssociation>;
  lineage_segments: Map<string, SegmentLineage>;
  generation_records: Map<string, GenerationRecord>;
  edit_records: Map<string, EditOperationRecord>;
  timeline_events: TimelineEvent[]; // ordered, hash-linked
  render_recipes: Map<string, RenderRecipe>;
  export_manifests: Map<string, ExportManifest>;
  c2pa_credentials: Map<string, C2PACredential>;
  consent_records: Map<string, ConsentProvenance>;
  external_transactions: Map<string, ExternalTransaction>;
};
