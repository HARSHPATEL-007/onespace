/**
 * N0VA VIDEOS — Copilot Plan-Simulate-Approve-Commit Types
 * Deep product design: transparent, explainable, reversible, auditable
 * Aligns with NIST AI RMF: transparency, explainability, provenance, overrides
 */

export type AutonomyMode =
  | "observe"        // answers + evidence, no changes
  | "suggest"        // creates proposals, user accepts each op
  | "assisted"       // applies to temp branch, user approves merge
  | "governed_autonomous" // executes approved op classes, policy gates high-risk
  | "locked_production";  // reads only approved assets, no generative/destructive

export const AUTONOMY_MODES: { id: AutonomyMode; label: string; description: string; commit: string; color: string }[] = [
  { id: "observe", label: "Observe", description: "Answers questions and finds evidence", commit: "No changes", color: "#64748b" },
  { id: "suggest", label: "Suggest", description: "Creates proposals + alternatives", commit: "User accepts each operation", color: "#0ea5e9" },
  { id: "assisted", label: "Assisted", description: "Applies to temporary branch", commit: "User approves branch merge", color: "#8b5cf6" },
  { id: "governed_autonomous", label: "Governed", description: "Executes approved operation classes", commit: "Policy gates high-risk", color: "#10b981" },
  { id: "locked_production", label: "Locked", description: "Reads only approved assets", commit: "No generative/destructive", color: "#ef4444" },
];

export type IntentEnvelope = {
  intent_id: string;
  user_request: string;
  project_id: string;
  timeline_id: string;
  target_duration_ms: number | null;
  creative_goal: string | null;
  target_audience: string | null;
  source_scope: string; // e.g. approved_project_assets
  output_mode: "draft_branch" | "markers" | "evidence_only" | "derivative_matrix";
  autonomy_mode: AutonomyMode;
  constraints: {
    preserve_brand_assets: boolean;
    preserve_approved_audio: boolean;
    no_identity_generation: boolean;
    [k: string]: boolean;
  };
  inferred: Record<string, { value: unknown; reason: string; confidence: number }>;
  unknowns: string[];
  assumptions: string[];
  requires_approval: boolean;
  created_at: string;
};

export type ContextPacket = {
  project_id: string;
  timeline_id: string;
  branch: string;
  base_snapshot: string;
  current_timeline: { tracks: unknown[]; markers: unknown[]; duration_ms: number };
  locked_clips: string[];
  approved_clips: string[];
  transcripts: { asset_id: string; language: string; segments: { start_ms: number; end_ms: number; text: string; speaker: string; confidence: number }[] }[];
  scene_boundaries: { start_ms: number; end_ms: number; type: string; confidence: number }[];
  shot_classifications: { shot_id: string; range: [number, number]; quality: number; type: string }[];
  objects: { asset_id: string; object: string; range: [number, number]; confidence: number }[];
  faces: { face_id: string; consent: "granted" | "denied" | "unknown"; range: [number, number] }[];
  review_comments: { id: string; body: string; range: [number, number]; resolved: boolean; severity: string; owner: string }[];
  script: { doc_id: string; title: string; segments: { text: string; range: [number, number] }[] } | null;
  shot_list: unknown | null;
  brand_guidelines: { primary_color: string; font: string; logo_id: string; rules: string[] } | null;
  target_platform: { name: string; aspect: string; max_duration_ms: number; caption_policy: string } | null;
  legal_holds: { asset_id: string; reason: string }[];
  prior_suggestions: { accepted: number; rejected: number; modified: number };
  tasks: { id: string; title: string; status: string; due_at: string }[];
  retrieved_sources: { source: string; scope: string; purpose: string; included: boolean }[];
};

export type EvidenceKind = "exact" | "semantic" | "visual" | "inferred";

export type Evidence = {
  result: string;
  timecode: string;
  range_ms: [number, number];
  evidence: string;
  kind: EvidenceKind;
  confidence: number;
  speaker?: string;
  asset_id?: string;
  jump_target_ms?: number;
};

export type OperationType =
  | "select_clip"
  | "trim_clip"
  | "remove_silence"
  | "remove_clip"
  | "reorder_clips"
  | "add_transition"
  | "apply_grade"
  | "apply_lut"
  | "add_caption"
  | "add_marker"
  | "create_branch"
  | "generate_derivative"
  | "audio_cleanup"
  | "speed_ramp";

export type EditOperation = {
  op_id: string;
  type: OperationType;
  description: string;
  affected_tracks: string[];
  time_range: [number, number];
  source_asset?: string;
  source_in_ms?: number;
  source_out_ms?: number;
  parameters?: Record<string, unknown>;
  reason: string;
  evidence_ids?: string[];
  confidence: number;
  risk: "low" | "medium" | "high" | "critical";
  reversibility: "complete" | "parameterized" | "branch-only" | "derived" | "external" | "irreversible";
  assumptions?: string[];
  inserted?: string[];
  removed?: string[];
};

export type ConfidenceBreakdown = {
  retrieval: number;
  semantic: number;
  edit: number;
  technical: number;
  policy: number;
  user_preference: number;
  overall: number;
  explanation: string;
  uncertainty_reason?: string;
};

export type RiskAssessment = {
  level: "low" | "medium" | "high" | "critical";
  reversibility: EditOperation["reversibility"];
  policy_flags: string[];
  requires_approval: boolean;
  approver_role?: string;
  estimated_render_cost_usd: number;
  estimated_render_ms: number;
  rollback_info: string;
};

export type SimulationPackage = {
  proxy_video_url: string;
  audio_preview_url: string;
  before_duration_ms: number;
  after_duration_ms: number;
  duration_delta_ms: number;
  diff: { added: number; removed: number; modified: number; unchanged: number };
  timeline_diff: { before: unknown; after: unknown };
  color_changes: string[];
  audio_changes: string[];
  caption_changes: string[];
  compliance_warnings: string[];
  export_impact: string[];
  quality_score: number;
  cost_estimate_usd: number;
  render_time_estimate_ms: number;
  proxy_quality: "proxy" | "full";
};

export type Proposal = {
  proposal_id: string;
  intent: IntentEnvelope;
  base_snapshot: string;
  target_branch: string;
  operations: EditOperation[];
  confidence: ConfidenceBreakdown;
  risk: RiskAssessment;
  simulation: SimulationPackage;
  evidence: Evidence[];
  context_sources: string[];
  created_at: string;
  status: "draft" | "preview_ready" | "awaiting_approval" | "approved" | "rejected" | "merged" | "archived";
  decision?: { by: string; at: string; action: "accept_all" | "accept_selected" | "reject" | "modify"; selected_ops?: string[]; note?: string };
  merge_conflict?: { has_conflict: boolean; conflicting_range: [number, number] | null; message: string };
};

export type Snapshot = {
  snapshot_id: string;
  project_id: string;
  timeline_id: string;
  branch: string;
  parent: string | null;
  created_at: string;
  created_by: string;
  timeline: unknown;
  hash: string;
};

export type AuditRecord = {
  audit_id: string;
  intent_id: string;
  proposal_id: string;
  autonomy_mode: AutonomyMode;
  user_request: string;
  retrieved_context: string[];
  agent_calls: { agent: string; input: unknown; output: unknown; duration_ms: number }[];
  model_versions: Record<string, string>;
  tool_actions: string[];
  human_decisions: string[];
  final_commit_hash: string | null;
  rollback_options: string[];
  created_at: string;
  provenance: { source_asset: string; timecode: string; confidence: number }[];
  overrides: { field: string; original: unknown; overridden: unknown; by: string; reason: string }[];
};

export type AgentContract = {
  agent: string;
  capabilities: string[];
  required_permissions: string[];
  prohibited_actions: string[];
  input_schema: string;
  output_schema: string;
  rollback: EditOperation["reversibility"];
  risk_class: "low" | "medium" | "high" | "critical";
};

export const AGENT_CONTRACTS: AgentContract[] = [
  { agent: "RetrievalAgent", capabilities: ["search_transcript", "search_semantic", "find_evidence"], required_permissions: ["project.read"], prohibited_actions: ["timeline.write", "publish_external"], input_schema: "EvidenceQuery.v1", output_schema: "EvidenceSet.v1", rollback: "complete", risk_class: "low" },
  { agent: "NarrativePlanner", capabilities: ["rank_segments", "select_open_body_close", "remove_redundancy"], required_permissions: ["timeline.read", "transcript.read"], prohibited_actions: ["modify_locked_master"], input_schema: "RoughCutSpec.v1", output_schema: "NarrativePlan.v1", rollback: "branch-only", risk_class: "medium" },
  { agent: "AutoEditorAgent", capabilities: ["generate_rough_cut", "trim_silence", "rebalance_audio"], required_permissions: ["timeline.branch.write"], prohibited_actions: ["modify_locked_master", "publish_external"], input_schema: "EditPlan.v3", output_schema: "TimelineBranch.v2", rollback: "branch-only", risk_class: "medium" },
  { agent: "ColoristAgent", capabilities: ["suggest_grade", "apply_grade_to_branch"], required_permissions: ["timeline.branch.write"], prohibited_actions: ["modify_locked_master", "publish_external"], input_schema: "ColorPlan.v3", output_schema: "GradeProposal.v2", rollback: "parameterized", risk_class: "medium" },
  { agent: "SoundDesignerAgent", capabilities: ["cleanup_dialogue", "place_music", "suggest_sfx"], required_permissions: ["timeline.branch.write"], prohibited_actions: ["modify_locked_master"], input_schema: "AudioPlan.v2", output_schema: "AudioProposal.v1", rollback: "parameterized", risk_class: "medium" },
  { agent: "CaptionAgent", capabilities: ["transcribe", "diarize", "generate_captions"], required_permissions: ["asset.read"], prohibited_actions: ["publish_external"], input_schema: "CaptionRequest.v2", output_schema: "CaptionSet.v1", rollback: "complete", risk_class: "low" },
  { agent: "ComplianceAgent", capabilities: ["scan_copyright", "check_brand", "validate_consent"], required_permissions: ["project.read", "asset.read"], prohibited_actions: ["timeline.write"], input_schema: "ComplianceScan.v1", output_schema: "ComplianceReport.v1", rollback: "complete", risk_class: "low" },
  { agent: "DistributionAgent", capabilities: ["prepare_derivatives", "publish"], required_permissions: ["timeline.read", "export.write"], prohibited_actions: ["purge_media"], input_schema: "PublishRequest.v1", output_schema: "PublishResult.v1", rollback: "external", risk_class: "critical" },
];

export type PermissionEntry = {
  action: string;
  default_autonomy: AutonomyMode | "disabled";
  approval: string;
};

export const PERMISSION_MATRIX: PermissionEntry[] = [
  { action: "Search assets and transcripts", default_autonomy: "observe", approval: "None" },
  { action: "Add markers", default_autonomy: "observe", approval: "Optional in draft" },
  { action: "Create proposal branch", default_autonomy: "observe", approval: "None" },
  { action: "Trim or reorder draft clips", default_autonomy: "assisted", approval: "User approval" },
  { action: "Modify approved master", default_autonomy: "disabled", approval: "Elevated approval" },
  { action: "Change brand assets", default_autonomy: "disabled", approval: "Brand owner approval" },
  { action: "Use face recognition", default_autonomy: "observe", approval: "Consent validation (policy-controlled)" },
  { action: "Clone a voice", default_autonomy: "disabled", approval: "Explicit consent + approval" },
  { action: "Generate synthetic identity media", default_autonomy: "disabled", approval: "Legal + identity approval" },
  { action: "Export draft", default_autonomy: "assisted", approval: "User approval" },
  { action: "Publish externally", default_autonomy: "disabled", approval: "Named approver (default-deny timeout)" },
  { action: "Delete or purge media", default_autonomy: "disabled", approval: "Admin + policy approval" },
];

export type DerivativeVariant = {
  variant: string;
  aspect: string;
  duration_strategy: string;
  captions: string;
  safe_area: string;
  approval: string;
};

export const DERIVATIVE_MATRIX: DerivativeVariant[] = [
  { variant: "LinkedIn", aspect: "1:1 or 16:9", duration_strategy: "Strong opening, concise", captions: "Burn-in or sidecar", safe_area: "Professional title-safe", approval: "Required" },
  { variant: "YouTube", aspect: "16:9", duration_strategy: "Full narrative + chapters", captions: "Multiple language tracks", safe_area: "Standard broadcast-safe", approval: "Required" },
  { variant: "Instagram", aspect: "9:16", duration_strategy: "Hook-first short", captions: "Burn-in", safe_area: "Vertical safe areas", approval: "Required" },
];
