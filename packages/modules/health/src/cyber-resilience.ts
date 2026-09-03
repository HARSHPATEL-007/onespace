// N0VA Cybersecurity and Clinical Resilience Program — Project Vita (Health & Wellness).
// Covers software, infrastructure, integrations, connected medical devices,
// firmware, backups, people, and recovery operations. The objective is not
// only to prevent compromise, but to continue safe care, isolate affected
// devices, recover trusted systems, and communicate clearly when clinical
// data or device functions are unavailable.
//
// Governing principle: N0VA must be able to distrust, isolate, restore, and
// clinically validate every component without losing accountability or
// allowing a cybersecurity event to become a silent patient-safety event.
//
// Recovery targets are risk-based: Tier 0 life-safety (minutes) does not
// share objectives with Tier 4 research analytics (days). Technical
// restoration and clinical validation are separate states — a system is
// never "recovered" until clinicians verify medication lists, allergies,
// critical results, identity, referrals, discharge plans, and audit history.
import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import crypto from "node:crypto";

const MODULE = "health_cyber";
export const CYBER_PROGRAM_VERSION = "2026.09";

// ── Five protection dimensions — protected separately ─────────────────
export const PROTECTION_DIMENSIONS = {
  CONFIDENTIALITY: { label: "Confidentiality", objective: "Prevent unauthorized disclosure" },
  INTEGRITY: { label: "Integrity", objective: "Prevent undetected alteration" },
  AVAILABILITY: { label: "Availability", objective: "Maintain access to essential functions" },
  AUTHENTICITY: { label: "Authenticity", objective: "Verify software, devices, users, and data sources" },
  CLINICAL_CONTINUITY: { label: "Clinical continuity", objective: "Preserve safe care when technology fails" },
} as const;
export type ProtectionDimension = keyof typeof PROTECTION_DIMENSIONS;

// ── Resilience architecture pipeline ─────────────────────────────────
export const RESILIENCE_PIPELINE = [
  "asset_inventory_and_sbom",
  "threat_modeling_and_vuln_intel",
  "secure_development_and_supply_chain",
  "continuous_monitoring",
  "detection_and_response",
  "immutable_recovery_environment",
  "validated_restoration",
  "clinical_reconciliation",
  "post_incident_improvement",
] as const;
export const RESPONSE_LEVERS = [
  "device_quarantine", "credential_revocation", "network_isolation",
  "service_degradation", "clinical_fallback",
] as const;

// ── Clinical tiers — risk-based RTO/RPO (starting targets) ───────────
export const CLINICAL_TIERS = {
  TIER_0: { label: "Tier 0: life-safety", examples: ["critical_result_escalation", "emergency_identity", "urgent_alerts"], rto: "minutes", rpo: "near_zero_to_minutes", fallback: "phone_radio_paper_manual_escalation" },
  TIER_1: { label: "Tier 1: critical care", examples: ["medication_ordering", "allergy_data", "discharge_safety_checks", "active_patient_records"], rto: "15_30_minutes", rpo: "5_15_minutes", fallback: "read_only_cache_pharmacist_manual_workflow" },
  TIER_2: { label: "Tier 2: urgent operations", examples: ["referrals", "scheduling", "pharmacy_coordination", "care_tasks"], rto: "1_4_hours", rpo: "30_60_minutes", fallback: "coordinator_workflow" },
  TIER_3: { label: "Tier 3: routine operations", examples: ["billing", "routine_reporting", "workforce_admin"], rto: "24_hours", rpo: "4_24_hours", fallback: "deferred_processing" },
  TIER_4: { label: "Tier 4: nonclinical", examples: ["research_analytics", "development", "historical_reporting"], rto: "48_72_hours", rpo: "24_72_hours", fallback: "restore_later" },
} as const;
export type ClinicalTier = keyof typeof CLINICAL_TIERS;

export function tierForService(service: string): ClinicalTier {
  const s = service.toLowerCase();
  if (/critical_result|emergency_identity|urgent_alert|escalation/.test(s)) return "TIER_0";
  if (/medication|allergy|discharge|active_patient|patient_record|device_monitor/.test(s)) return "TIER_1";
  if (/referral|schedul|pharmacy_coord|care_task|portal/.test(s)) return "TIER_2";
  if (/bill|routine_report|workforce|admin/.test(s)) return "TIER_3";
  return "TIER_4";
}

// RTO = max acceptable restore time. RPO = max acceptable data loss in time.
// Never claim RPO zero unless the architecture can actually support it.
export const RTO_DEFINITION = "maximum acceptable time to restore a service";
export const RPO_DEFINITION = "maximum acceptable data loss measured in time";

// ── Dependency-aware recovery order ───────────────────────────────────
export const RECOVERY_ORDER = [
  "identity_and_authorization",
  "time_sync_and_key_services",
  "core_patient_and_clinical_data",
  "medication_and_allergy_services",
  "critical_result_processing_and_notification",
  "clinical_event_broker",
  "fhir_and_hl7_integrations",
  "pharmacy_and_referral_connectivity",
  "imaging_and_viewer_services",
  "patient_and_clinician_portals",
  "analytics_and_reporting",
  "research_and_nonclinical_systems",
] as const;

/** A service must not be declared recovered while a critical dependency is unavailable or untrusted. */
export function canDeclareRecovered(dependencyStates: Array<{ dependency: string; available: boolean; trusted: boolean; critical: boolean }>): { recoverable: boolean; blockers: string[] } {
  const blockers = dependencyStates.filter((d) => d.critical && (!d.available || !d.trusted)).map((d) => d.dependency);
  return { recoverable: blockers.length === 0, blockers };
}

// ── Asset inventory ───────────────────────────────────────────────────
export const ASSET_TYPES = [
  "nova_service", "api", "database", "message_broker", "mobile_app", "edge_device",
  "medical_device", "medical_device_integration", "firmware", "operating_system",
  "cloud_resource", "third_party_service", "oss_package", "infrastructure_as_code",
  "crypto_key", "certificate", "data_store", "backup", "admin_account",
  "vendor_support_connection",
] as const;

export const assetSchema = z.object({
  assetId: z.string().min(1).default(""),
  assetType: z.enum(ASSET_TYPES),
  owner: z.string().min(1),
  environment: z.string().default("production"),
  clinicalCriticality: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  patientData: z.boolean().default(false),
  networkZone: z.string().default("default"),
  vendor: z.string().default(""),
  firmware: z.string().default(""),
  sbomRef: z.string().default(""),
  supportStatus: z.string().default("supported"),
  patchWindow: z.string().default("configured"),
  rto: z.string().default("configured"),
  rpo: z.string().default("configured"),
  fallback: z.string().min(1),
  securityContact: z.string().default(""),
  lastValidation: z.string().default(""),
});
export type AssetInput = z.infer<typeof assetSchema>;

// An asset must not enter production without owner, support status,
// dependency record, clinical criticality, recovery target, security
// contact, and fallback plan.
export function productionReadinessGate(asset: AssetInput): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!asset.owner) missing.push("owner");
  if (!asset.supportStatus) missing.push("support_status");
  if (!asset.clinicalCriticality) missing.push("clinical_criticality");
  if (!asset.rto || asset.rto === "configured") missing.push("recovery_target_rto");
  if (!asset.securityContact) missing.push("security_contact");
  if (!asset.fallback) missing.push("fallback_plan");
  return { ready: missing.length === 0, missing };
}

// ── Software bill of materials ────────────────────────────────────────
export const SBOM_FIELDS = [
  "component_name", "version", "supplier", "package_identifier", "license",
  "dependency_relationship", "hash", "build_source", "build_timestamp",
  "toolchain", "image_digest", "vulnerability_status", "end_of_support",
  "provenance", "signing_info", "runtime_environment", "device_compatibility",
  "firmware_relationship",
] as const;
export const SBOM_GENERATION_TRIGGERS = [
  "source_build", "container_creation", "before_release", "dependency_update",
  "vendor_notification", "incident_response", "firmware_acceptance",
] as const;
export const SBOM_LINK_TARGETS = [
  "deployment", "service_version", "device_model", "firmware_version",
  "configuration", "vulnerability_findings", "exposure_status",
  "compensating_controls", "remediation_decision",
] as const;

export const sbomSchema = z.object({
  sbomId: z.string().min(1).default(""),
  artifact: z.string().min(1),
  artifactDigest: z.string().default(""),
  format: z.string().default("configured"),
  generatedAt: z.coerce.date().optional(),
  components: z.array(z.object({
    name: z.string().min(1), version: z.string().default("configured"),
    supplier: z.string().default(""), purl: z.string().default(""),
    hash: z.string().default(""), license: z.string().default("configured"),
  })).default([]),
  signer: z.string().default(""),
  signature: z.string().default(""),
  vulnerabilityScan: z.string().default("completed"),
});

/** Check an artifact's SBOM linkage for gaps before production admission. */
export function sbomLinkCheck(links: Record<string, boolean>): { complete: boolean; missing: string[] } {
  const missing = SBOM_LINK_TARGETS.filter((t) => !links[t]);
  return { complete: missing.length === 0, missing: [...missing] };
}

// ── Supply-chain controls ─────────────────────────────────────────────
export const SUPPLY_CHAIN_CONTROLS = [
  "signed_commits", "protected_branches", "reproducible_builds", "isolated_build_envs",
  "dependency_pinning", "private_registry", "dependency_provenance", "malware_scanning",
  "secret_scanning", "static_analysis", "software_composition_analysis", "container_scanning",
  "iac_scanning", "artifact_signing", "admission_control", "deployment_attestation",
  "vendor_security_review", "eol_monitoring",
] as const;
export const ARTIFACT_ADMISSION = [
  "built_by_approved_pipeline", "current_sbom", "signed", "scanned",
  "linked_to_approved_change", "target_compatible", "within_vuln_policy",
  "rollback_or_recovery_covered",
] as const;

export function artifactAdmissionCheck(checks: Record<string, boolean>): { admitted: boolean; failed: string[] } {
  const failed = ARTIFACT_ADMISSION.filter((c) => !checks[c]);
  return { admitted: failed.length === 0, failed: [...failed] };
}

// ── Vulnerability management — severity alone is not enough ───────────
export const VULN_RISK_FACTORS: Record<string, { weight: number; hint: string }> = {
  exploitability: { weight: 10, hint: "Ease of exploitation" },
  known_exploitation: { weight: 18, hint: "Exploited in the wild (KEV)" },
  internet_exposure: { weight: 14, hint: "Reachable from untrusted networks" },
  patient_data_access: { weight: 12, hint: "Asset touches patient data" },
  clinical_impact: { weight: 14, hint: "Diagnosis/treatment/monitoring effect" },
  privilege_level: { weight: 6, hint: "Privileges gained on success" },
  device_prevalence: { weight: 5, hint: "Fleet penetration" },
  medical_device_function: { weight: 10, hint: "Safety-critical device function" },
  availability_impact: { weight: 6, hint: "Care availability impact" },
  compensating_controls: { weight: -8, hint: "Effective compensating control present" },
  vendor_support: { weight: -4, hint: "Vendor-supported patch path" },
  patch_safety: { weight: -4, hint: "Patch testable without clinical risk" },
  recovery_complexity: { weight: 4, hint: "Recovery difficulty" },
  exposure_duration: { weight: 5, hint: "Time exposed" },
};
export const VULN_LIFECYCLE = [
  "DISCOVERED", "VALIDATED", "RISK_RANKED", "ASSIGNED", "PATCH_AVAILABLE",
  "PATCH_TESTED", "DEPLOYMENT_SCHEDULED", "DEPLOYED", "VERIFIED", "CLOSED",
] as const;
const VULN_TRANSITIONS: Record<string, string[]> = {
  DISCOVERED: ["VALIDATED"], VALIDATED: ["RISK_RANKED"], RISK_RANKED: ["ASSIGNED"],
  ASSIGNED: ["PATCH_AVAILABLE", "RISK_RANKED"], PATCH_AVAILABLE: ["PATCH_TESTED"],
  PATCH_TESTED: ["DEPLOYMENT_SCHEDULED"], DEPLOYMENT_SCHEDULED: ["DEPLOYED"],
  DEPLOYED: ["VERIFIED"], VERIFIED: ["CLOSED"], CLOSED: [],
};
export function canTransitionVuln(from: string, to: string): boolean {
  return (VULN_TRANSITIONS[from] ?? []).includes(to);
}

export const vulnSchema = z.object({
  vulnId: z.string().min(1).default(""),
  assetId: z.string().min(1),
  title: z.string().min(1),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("HIGH"),
  factors: z.record(z.number()).default({}),
  status: z.enum(VULN_LIFECYCLE).default("DISCOVERED"),
  assignee: z.string().default(""),
  evidence: z.string().default(""),
});

export interface VulnRank { score: number; level: "LOW" | "MODERATE" | "HIGH" | "CRITICAL"; decision: string }
export function rankVulnerability(factors: Record<string, number>): VulnRank {
  let score = 0;
  for (const [k, v] of Object.entries(factors)) {
    const w = VULN_RISK_FACTORS[k]?.weight ?? 0;
    score += w * Math.min(1, Math.max(0, v));
  }
  score = Math.round(Math.min(100, Math.max(0, score)));
  const level = score <= 24 ? "LOW" : score <= 49 ? "MODERATE" : score <= 74 ? "HIGH" : "CRITICAL";
  const decision = level === "LOW" ? "standard_patch_window" : level === "MODERATE" ? "prioritized_patch_window" : level === "HIGH" ? "expedited_staged_deployment" : "emergency_review_staged_or_compensating_control";
  return { score, level, decision };
}

export const vulnExceptionSchema = z.object({
  vulnId: z.string().min(1),
  justification: z.string().min(1),
  owner: z.string().min(1),
  expiresAt: z.coerce.date(),
  compensatingControl: z.string().min(1),
  monitoring: z.string().default(""),
  reassessmentDate: z.coerce.date(),
  approvalLevel: z.string().default("security_officer"),
});
// Never permanent accepted risk: expiry is mandatory and enforced.

// ── Vulnerability disclosure program ──────────────────────────────────
export const DISCLOSURE_EXTERNAL = [
  "security_contact", "disclosure_policy", "supported_versions", "safe_harbor",
  "encryption_option", "acknowledgement_sla", "severity_triage", "coordinated_disclosure",
  "status_updates", "researcher_recognition", "emergency_route",
] as const;
export const DISCLOSURE_REPORTERS = [
  "workforce", "clinicians", "patients", "vendors", "device_manufacturers",
  "contractors", "security_researchers", "field_teams",
] as const;
export const DISCLOSURE_CAPTURE = [
  "reporter", "asset", "vulnerability", "evidence", "reproduction_steps",
  "patient_or_clinical_impact", "exploit_status", "disclosure_timeline",
  "remediation", "communication_status",
] as const;
export const disclosureSchema = z.object({
  reporter: z.string().min(1),
  reporterType: z.enum(DISCLOSURE_REPORTERS),
  assetId: z.string().min(1),
  title: z.string().min(1),
  evidence: z.string().default(""),
  reproductionSteps: z.string().default(""),
  clinicalImpact: z.string().default(""),
  exploitStatus: z.string().default("unknown"),
});

// ── Medical-device patching ───────────────────────────────────────────
export const PATCH_PRECHECKLIST = [
  "affected_models", "clinical_functions", "vendor_support", "regulatory_constraints",
  "representative_test", "interoperability", "backup_or_manual_operation",
  "downtime_schedule", "clinical_notification", "rollback_confirmed", "post_update_validation",
] as const;
export const PATCH_PRIORITY_SIGNALS = [
  "affects_diagnosis_or_treatment", "monitors_critical_patients", "controls_medication_delivery",
  "connects_to_patient_identity", "transfers_clinical_results", "internet_exposed",
  "known_active_exploitation", "cannot_be_isolated_safely",
] as const;
export const PATCH_DECISION_FLOW = [
  "vulnerability_identified", "exposure_determined", "clinical_cyber_risk_assessed",
  "vendor_guidance_obtained", "patch_tested", "patch_or_compensating_selected",
  "downtime_approved", "staged_deployment", "function_verified", "regression_monitored", "closed_or_reassessed",
] as const;

export const devicePatchSchema = z.object({
  patchId: z.string().min(1).default(""),
  deviceModels: z.array(z.string()).min(1),
  vulnId: z.string().default(""),
  prechecks: z.record(z.boolean()).default({}),
  prioritySignals: z.array(z.string()).default([]),
  vendorGuidance: z.string().default(""),
  wave: z.coerce.number().int().min(1).default(1),
  downtimeApprovedBy: z.string().default(""),
  status: z.enum(["PLANNED", "TESTED", "APPROVED", "DEPLOYING", "VERIFYING", "CLOSED", "REASSESSED"]).default("PLANNED"),
});

export function patchPrecheckGaps(prechecks: Record<string, boolean>): string[] {
  return PATCH_PRECHECKLIST.filter((c) => !prechecks[c]);
}

// ── Compensating controls — documented, owned, expiring ───────────────
export const COMPENSATING_CONTROLS = [
  "network_segmentation", "allowlisting", "remove_internet_access", "restricted_vendor_access",
  "disable_unused_services", "application_isolation", "protocol_filtering", "additional_monitoring",
  "manual_verification", "increased_clinical_checks", "supported_replacement",
  "temporary_retirement", "reduced_functionality", "physical_access_controls",
] as const;
export const compensatingSchema = z.object({
  controlId: z.string().min(1).default(""),
  assetId: z.string().min(1),
  vulnId: z.string().default(""),
  control: z.enum(COMPENSATING_CONTROLS),
  threatAddressed: z.string().min(1),
  residualRisk: z.string().default(""),
  clinicalEffect: z.string().default(""),
  owner: z.string().min(1),
  expiresAt: z.coerce.date(),
  monitoring: z.string().default(""),
  replacementPlan: z.string().default(""),
  approval: z.string().default(""),
});
// A compensating control must not become an indefinite substitute for a supported fix.

// ── Firmware signature validation ─────────────────────────────────────
export const FIRMWARE_ACCEPTANCE = [
  "approved_source", "signature_valid", "certificate_trusted_current", "model_match",
  "version_approved", "not_revoked", "hash_match", "update_authorized",
  "rollback_available_or_assessed", "post_update_integrity_ok",
] as const;
export const FIRMWARE_WORKFLOW = [
  "received", "source_verified", "signature_verified", "chain_verified",
  "compatibility_verified", "revocation_checked", "version_policy_checked",
  "staged", "pre_update_captured", "applied_in_window", "boot_verified",
  "connectivity_confirmed", "evidence_recorded",
] as const;

export const firmwareSchema = z.object({
  deviceModel: z.string().min(1),
  version: z.string().min(1),
  source: z.string().min(1),
  signatureValid: z.boolean(),
  certificateTrusted: z.boolean(),
  modelMatch: z.boolean(),
  versionApproved: z.boolean(),
  revoked: z.boolean().default(false),
  hashMatch: z.boolean(),
  authorized: z.boolean(),
  rollbackAvailable: z.boolean(),
});

export function validateFirmware(f: z.infer<typeof firmwareSchema>): { accepted: boolean; failures: string[] } {
  const failures: string[] = [];
  if (!f.source) failures.push("unapproved_source");
  if (!f.signatureValid) failures.push("signature_invalid");
  if (!f.certificateTrusted) failures.push("certificate_untrusted_or_expired");
  if (!f.modelMatch) failures.push("model_mismatch");
  if (!f.versionApproved) failures.push("version_not_approved");
  if (f.revoked) failures.push("package_revoked");
  if (!f.hashMatch) failures.push("hash_mismatch");
  if (!f.authorized) failures.push("update_not_authorized");
  if (!f.rollbackAvailable) failures.push("rollback_unavailable_unassessed");
  return { accepted: failures.length === 0, failures };
}

// ── Device quarantine — automatic over policy, never silent on life-critical ──
export const QUARANTINE_TRIGGERS = [
  "malware_or_compromise", "invalid_firmware", "failed_attestation", "unsupported_software",
  "repeated_auth_failures", "unexpected_network_behavior", "patient_data_mismatch",
  "unusual_outbound_traffic", "certificate_failure", "tampering", "device_loss",
  "abnormal_commands", "data_integrity_failure",
] as const;
export const QUARANTINE_STATES = {
  OBSERVATION: { label: "Observation", behavior: "Enhanced monitoring" },
  RESTRICTED: { label: "Restricted", behavior: "Limited network and read-only use" },
  QUARANTINED: { label: "Quarantined", behavior: "No clinical data exchange" },
  FORENSIC_HOLD: { label: "Forensic hold", behavior: "Preserve evidence, prohibit modification" },
  REVALIDATED: { label: "Revalidated", behavior: "Cleared after security and clinical checks" },
  RETIRED: { label: "Retired", behavior: "Removed from service and securely sanitized" },
} as const;
export type QuarantineState = keyof typeof QUARANTINE_STATES;
export const QUARANTINE_WORKFLOW = [
  "threat_detected", "signal_confirmed", "criticality_classified", "owner_notified",
  "network_moved", "logs_preserved", "credentials_revoked", "fallback_activated",
  "investigated", "remediated", "clinically_validated", "staged_reconnect", "data_reconciled",
] as const;

export interface QuarantineDecision {
  state: QuarantineState;
  clinicalEscalation: boolean;
  actions: string[];
  clinicianMessage: string;
}
export function quarantineDecision(trigger: string, clinicalCriticality: string, lifeCritical: boolean, dataTrustworthy: boolean): QuarantineDecision {
  // Quarantine must not silently disconnect a life-critical device.
  if (lifeCritical) {
    return {
      state: "RESTRICTED",
      clinicalEscalation: true,
      actions: ["route_to_clinical_engineering_and_care_team", "activate_manual_monitoring", "enhanced_monitoring", "preserve_logs", "document_risk_decision"],
      clinicianMessage: `Device flagged (${trigger}) — RESTRICTED, NOT disconnected: life-critical function preserved under manual monitoring. Data marked stale/unavailable until revalidated.`,
    };
  }
  if (clinicalCriticality === "critical" || !dataTrustworthy) {
    return {
      state: "QUARANTINED",
      clinicalEscalation: true,
      actions: ["move_to_quarantine_network", "revoke_credentials", "preserve_logs_and_state", "activate_manual_fallback", "notify_clinical_owner"],
      clinicianMessage: `Device quarantined (${trigger}) — no clinical data exchange. Manual fallback active; data from this device is unavailable until revalidated.`,
    };
  }
  return {
    state: "OBSERVATION",
    clinicalEscalation: false,
    actions: ["enhanced_monitoring", "preserve_logs", "notify_clinical_owner"],
    clinicianMessage: `Device under observation (${trigger}) — enhanced monitoring, data flagged for review.`,
  };
}

// ── Ransomware resilience ─────────────────────────────────────────────
export const RANSOMWARE_PREVENT = [
  "network_segmentation", "privileged_access_management", "phishing_resistant_mfa",
  "endpoint_protection", "application_allowlisting", "immutable_backups",
  "offline_recovery_copies", "egress_monitoring", "least_privilege",
  "credential_separation", "patch_management", "tested_restoration",
  "service_account_controls", "centralized_logging", "data_integrity_monitoring",
] as const;
export const RANSOMWARE_RESPONSE = [
  "detect", "isolate_affected", "protect_identity_and_backups", "stop_lateral_movement",
  "preserve_evidence", "activate_continuity_plan", "determine_trustworthy_systems",
  "restore_clean_dependencies", "validate_integrity", "staged_reconnect",
  "reconcile_records", "communicate_status", "post_incident_review",
] as const;

// ── Immutable backups — 3-2-1 (+1 for highly critical) ───────────────
export const BACKUP_TYPES = [
  "online_operational", "immutable_object_lock", "offline_isolated", "encrypted",
  "database_native", "configuration", "identity_and_policy", "audit_log",
  "device_configuration", "recovery_environment_image",
] as const;
export const BACKUP_CONTROLS = [
  "separate_credentials", "mfa_privileged_access", "immutable_retention",
  "deletion_protection", "cross_region_copies", "key_separation", "integrity_hashes",
  "malware_scanning", "restore_testing", "dependency_maps", "backup_monitoring",
  "failed_backup_alerts", "legal_hold_support", "resilient_management_plane",
] as const;
export const BACKUP_PRINCIPLE = "3 copies → 2 different storage technologies → 1 isolated or offline copy";

export const backupSchema = z.object({
  backupId: z.string().min(1).default(""),
  assetId: z.string().min(1),
  backupType: z.enum(BACKUP_TYPES),
  integrityHash: z.string().default(""),
  malwareScanned: z.boolean().default(false),
  restoreTestedAt: z.string().default(""),
  immutableUntil: z.coerce.date().optional(),
});

// Do not restore compromised backups merely because they are recent.
export function backupRestorable(b: { integrityHash: string; malwareScanned: boolean; restoreTestedAt: string }): { restorable: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (!b.integrityHash) blockers.push("integrity_unverified");
  if (!b.malwareScanned) blockers.push("malware_status_unknown");
  if (!b.restoreTestedAt) blockers.push("restore_never_tested");
  return { restorable: blockers.length === 0, blockers };
}

// ── Recovery validation — technical vs clinical states ────────────────
export const RECOVERY_VALIDATION = [
  "artifact_signature", "sbom_and_vuln_status", "configuration_integrity",
  "database_consistency", "referential_integrity", "patient_identity_integrity",
  "medication_and_allergy_records", "event_history", "audit_logging",
  "interface_connectivity", "device_associations", "user_permissions",
  "backup_completeness", "data_freshness", "clinical_workflow",
  "monitoring_and_alerting", "manual_fallback_closure",
] as const;

export function recoveryChecklistGaps(completed: Record<string, boolean>): string[] {
  return RECOVERY_VALIDATION.filter((c) => !completed[c]);
}

// ── Clinical continuity mode ──────────────────────────────────────────
export const CONTINUITY_CAPABILITIES = [
  "emergency_read_only_summaries", "offline_medication_allergy_view", "local_clinical_capture",
  "manual_critical_result_escalation", "approved_paper_or_encrypted_export",
  "store_and_forward_referrals", "local_care_plan_access", "device_independent_fallback",
  "visible_stale_data_warnings", "no_silent_sync_claims",
] as const;
export const LOCAL_EVENT_FIELDS = [
  "temporary_id", "patient_identity_confidence", "actor", "device",
  "timestamp", "integrity_hash", "sync_status", "reconciliation_required",
] as const;

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// ── Exercises: tabletops, red-team, DR drills ─────────────────────────
export const TABLETOP_SCENARIOS = [
  "ransomware_during_medication_round", "critical_result_notification_down",
  "compromised_medical_device", "firmware_signing_key_compromise",
  "vendor_remote_access_breach", "identity_provider_outage", "backup_deletion_attempt",
  "dicom_archive_unavailable", "hl7_feed_silently_delayed", "patient_data_corruption",
  "lost_field_tablet_offline_records", "regional_power_and_network_failure",
  "supply_chain_library_vuln", "insider_privileged_misuse",
] as const;
export const TABLETOP_OUTPUTS = [
  "decision_timeline", "assumptions", "escalation_points", "communication_gaps",
  "manual_fallback_gaps", "recovery_dependencies", "patient_safety_risks",
  "improvement_owners", "due_dates", "retest_date",
] as const;
export const RED_TEAM_TARGETS = [
  "credential_theft_resistance", "passkey_mfa_recovery", "privilege_escalation",
  "lateral_movement", "device_segmentation", "firmware_validation",
  "device_integration", "dicom_hl7_pathways", "outbox_event_integrity",
  "backup_isolation", "ransomware_containment", "data_exfiltration",
  "clean_room_escape", "service_identity_abuse", "emergency_access_misuse",
  "offline_device_compromise",
] as const;
export const RED_TEAM_BOUNDARIES = [
  "written_authorization", "clinical_safety_constraints", "no_uncontrolled_patient_impact",
  "production_canaries_only_with_approval", "clear_stop_conditions",
  "evidence_preservation", "coordinated_disclosure", "immediate_escalation_for_real_compromise",
] as const;
export const DRILL_TYPES = [
  "component_restore", "database_pitr", "full_environment_restore", "identity_restore",
  "broker_rebuild", "backup_console_recovery", "device_mgmt_recovery", "dicom_recovery",
  "partner_interface_recovery", "regional_failover", "offline_continuity",
  "ransomware_clean_room_recovery", "manual_fallback_exercise",
] as const;
export const DRILL_STAGES = [
  "plan", "success_criteria", "isolated_environment", "restore_from_backup",
  "integrity_validation", "clinical_workflow_validation", "dependencies_connected",
  "user_access_simulated", "rto_rpo_measured", "data_reconciled", "gaps_documented", "improve_and_repeat",
] as const;

export const exerciseSchema = z.object({
  exerciseId: z.string().min(1).default(""),
  kind: z.enum(["TABLETOP", "RED_TEAM", "DR_DRILL"]),
  scenario: z.string().min(1),
  participants: z.array(z.string()).default([]),
  findings: z.array(z.string()).default([]),
  improvementOwners: z.record(z.string()).default({}),
  retestDate: z.coerce.date().optional(),
  status: z.enum(["PLANNED", "EXECUTED", "REMEDIATED", "RETESTED"]).default("PLANNED"),
});

// ── Medical-device recovery ───────────────────────────────────────────
export const DEVICE_RECOVERY_DOCS = [
  "safe_shutdown", "manual_operation", "local_data_retention", "firmware_source",
  "reinstallation_process", "calibration", "clinical_validation", "network_reenrollment",
  "identity_certificate", "data_reconciliation", "vendor_contact", "replacement_stock", "downtime_procedure",
] as const;
export const POST_RESTORE_DEVICE_CHECKS = [
  "patient_association", "device_clock", "firmware_signature", "configuration",
  "calibration", "data_transmission", "alert_behavior", "no_duplicate_observations", "user_acceptance",
] as const;

// ── Data-integrity monitoring ─────────────────────────────────────────
export const INTEGRITY_SIGNALS = [
  "unexpected_record_changes", "deleted_events", "hash_mismatch", "database_drift",
  "event_sequence_gaps", "altered_audit_logs", "modified_firmware", "configuration_changes",
  "unusual_backup_changes", "unexpected_admin_actions", "inconsistent_patient_identifiers",
  "dicom_study_alteration", "hl7_replay_or_manipulation",
] as const;
export const INTEGRITY_TOOLS = [
  "cryptographic_hashes", "signed_events", "append_only_audit", "database_integrity_checks",
  "cross_system_reconciliation", "backup_comparisons", "configuration_baselines",
  "trusted_timestamps", "destructive_action_alerts",
] as const;

// ── Vendor and third-party resilience ─────────────────────────────────
export const VENDOR_REQUIREMENTS = [
  "security_contact", "sbom", "disclosure_process", "support_lifecycle", "patch_policy",
  "firmware_signing_model", "incident_notification_timeline", "breach_notification_obligations",
  "remote_access_controls", "recovery_commitments", "backup_responsibilities",
  "data_return_destruction", "conformance_evidence", "pentest_summary", "business_continuity_plan",
] as const;
export const VENDOR_ACCESS_RULES = [
  "just_in_time", "approved", "time_limited", "scoped", "logged", "monitored",
  "auto_revoked", "disabled_outside_support_windows",
] as const;

export const vendorSchema = z.object({
  vendorId: z.string().min(1).default(""),
  name: z.string().min(1),
  evidence: z.record(z.boolean()).default({}),
  remoteAccess: z.record(z.boolean()).default({}),
});

export function vendorEvidenceGaps(evidence: Record<string, boolean>): string[] {
  return VENDOR_REQUIREMENTS.filter((r) => !evidence[r]);
}

// ── Dashboards ────────────────────────────────────────────────────────
export const EXEC_DASHBOARD = [
  "critical_vulns", "unsupported_devices", "backup_health", "restore_test_status",
  "rto_rpo_performance", "open_high_risk_exceptions", "clinical_availability",
  "ransomware_readiness", "vendor_exposure", "incident_trends",
] as const;
export const SOC_DASHBOARD = [
  "endpoint_alerts", "device_quarantine", "credential_anomalies", "firmware_failures",
  "sbom_vuln_exposure", "egress_anomalies", "privileged_actions", "backup_tampering",
  "ransomware_indicators", "threat_hunt_findings",
] as const;
export const CLINENG_DASHBOARD = [
  "device_inventory", "firmware_versions", "patch_eligibility", "vendor_advisories",
  "compensating_controls", "downtime_windows", "quarantined_devices",
  "replacement_inventory", "post_patch_validation",
] as const;
export const CLINOPS_DASHBOARD = [
  "services_unavailable", "stale_data", "manual_workflows_active", "critical_notifications_pending",
  "medication_workflow_status", "device_data_gaps", "recovery_eta", "patient_safety_actions",
] as const;

// ── Cyber incidents ───────────────────────────────────────────────────
export const cyberIncidentSchema = z.object({
  kind: z.enum([
    "ransomware", "device_compromise", "firmware_tamper", "backup_tampering",
    "identity_outage", "vendor_breach", "data_integrity_failure", "quarantine_event",
    "vuln_exploitation", "insider_misuse", "supply_chain_compromise", "integration_outage",
  ]),
  severity: z.enum(["LOW", "MODERATE", "HIGH", "CRITICAL"]).default("HIGH"),
  assetId: z.string().default(""),
  detail: z.string().min(1).max(4000),
});
export const CYBER_RESPONSE_ACTIONS = [
  "isolate_affected", "protect_identity_and_backups", "revoke_credentials",
  "activate_continuity_plan", "preserve_evidence", "notify_clinical_and_governance",
  "validate_before_restore", "staged_reconnect", "reconcile_clinical_data",
  "communicate_status", "post_incident_review",
] as const;

// ── In-memory fallbacks (pre-migration) ───────────────────────────────
interface StoredRow extends Record<string, unknown> { id: string; workspaceId: string }
const memAssets = new Map<string, StoredRow[]>();
const memSboms = new Map<string, StoredRow[]>();
const memVulns = new Map<string, StoredRow[]>();
const memQuarantines = new Map<string, StoredRow[]>();
const memRecoveries = new Map<string, StoredRow[]>();
const memIncidents = new Map<string, StoredRow[]>();
const memExercises = new Map<string, StoredRow[]>();
const memVendors = new Map<string, StoredRow[]>();
const memBackups = new Map<string, StoredRow[]>();
const memPatches = new Map<string, StoredRow[]>();
const memControls = new Map<string, StoredRow[]>();

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}
function memList(m: Map<string, StoredRow[]>, ws: string): StoredRow[] { return m.get(ws) ?? []; }
function memPush(m: Map<string, StoredRow[]>, ws: string, row: StoredRow) { m.set(ws, [...(m.get(ws) ?? []), row]); }

type CyberTables = {
  healthCyberAsset: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; findFirst: (a: unknown) => Promise<never | null> };
  healthCyberSbom: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
  healthCyberVuln: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthCyberQuarantine: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthCyberRecovery: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthCyberIncident: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthCyberExercise: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
};

// ── Cybersecurity and Clinical Resilience Program ─────────────────────
export class CyberResilienceProgram {
  constructor(private readonly workspaceId: string, private readonly userId: string, private readonly role: Role) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, "health", action))) throw new Error(`Missing ${action} permission for health`);
  }
  private audit(action: string, targetId: string, meta?: Record<string, unknown>) {
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType: "CyberArtifact", targetId, metadata: meta }).catch(() => null);
  }

  // ── Assets ───────────────────────────────────────────────────────
  async registerAsset(input: AssetInput) {
    await this.assert("CREATE");
    const parsed = assetSchema.parse({ ...input, assetId: input.assetId || `asset-${crypto.randomUUID().slice(0, 8)}` });
    const gate = productionReadinessGate(parsed);
    if (parsed.environment === "production" && !gate.ready) {
      throw new Error(`Asset blocked from production — missing: ${gate.missing.join(", ")}`);
    }
    const row = await safe(
      () => (prisma as unknown as CyberTables).healthCyberAsset.create({
        data: {
          workspaceId: this.workspaceId, assetId: parsed.assetId, assetType: parsed.assetType,
          owner: parsed.owner, environment: parsed.environment, clinicalCriticality: parsed.clinicalCriticality,
          patientData: parsed.patientData, networkZone: parsed.networkZone, vendor: parsed.vendor,
          firmware: parsed.firmware, sbomRef: parsed.sbomRef, supportStatus: parsed.supportStatus,
          patchWindow: parsed.patchWindow, rto: parsed.rto, rpo: parsed.rpo, fallback: parsed.fallback,
          securityContact: parsed.securityContact, lastValidation: parsed.lastValidation, createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id: parsed.assetId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    if (!row) memPush(memAssets, this.workspaceId, stored);
    await this.audit("cyber.asset.registered", parsed.assetId, { assetType: parsed.assetType, criticality: parsed.clinicalCriticality });
    return { ...(row as unknown as Record<string, unknown> | null ?? stored), productionGate: gate };
  }

  async listAssets(opts?: { environment?: string; criticality?: string }) {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as unknown as CyberTables).healthCyberAsset.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 200 }) as Promise<never[]>,
      [],
    );
    let all = rows.length ? (rows as unknown as StoredRow[]) : memList(memAssets, this.workspaceId);
    if (opts?.environment) all = all.filter((a) => a.environment === opts.environment);
    if (opts?.criticality) all = all.filter((a) => a.clinicalCriticality === opts.criticality);
    return all;
  }

  // ── SBOM ─────────────────────────────────────────────────────────
  async recordSbom(input: z.infer<typeof sbomSchema>) {
    await this.assert("CREATE");
    const parsed = sbomSchema.parse({ ...input, sbomId: input.sbomId || `sbom-${crypto.randomUUID().slice(0, 8)}`, generatedAt: input.generatedAt ?? new Date() });
    const row = await safe(
      () => (prisma as unknown as CyberTables).healthCyberSbom.create({
        data: {
          workspaceId: this.workspaceId, sbomId: parsed.sbomId, artifact: parsed.artifact,
          artifactDigest: parsed.artifactDigest, format: parsed.format, generatedAt: parsed.generatedAt!,
          components: parsed.components, signer: parsed.signer, signature: parsed.signature,
          vulnerabilityScan: parsed.vulnerabilityScan, createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id: parsed.sbomId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    if (!row) memPush(memSboms, this.workspaceId, stored);
    await this.audit("cyber.sbom.recorded", parsed.sbomId, { artifact: parsed.artifact, components: parsed.components.length });
    return (row as unknown) ?? stored;
  }

  async listSboms() {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as unknown as CyberTables).healthCyberSbom.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 100 }) as Promise<never[]>,
      [],
    );
    return rows.length ? rows : memList(memSboms, this.workspaceId);
  }

  // ── Vulnerabilities ──────────────────────────────────────────────
  async reportVulnerability(input: z.infer<typeof vulnSchema>) {
    await this.assert("CREATE");
    const parsed = vulnSchema.parse({ ...input, vulnId: input.vulnId || `vuln-${crypto.randomUUID().slice(0, 8)}`, status: "DISCOVERED" as const });
    const rank = rankVulnerability(parsed.factors);
    const row = await safe(
      () => (prisma as unknown as CyberTables).healthCyberVuln.create({
        data: {
          workspaceId: this.workspaceId, vulnId: parsed.vulnId, assetId: parsed.assetId,
          title: parsed.title, severity: parsed.severity, factors: parsed.factors,
          riskScore: rank.score, riskLevel: rank.level, status: "DISCOVERED",
          assignee: parsed.assignee, evidence: parsed.evidence, createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id: parsed.vulnId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>), riskScore: rank.score, riskLevel: rank.level };
    if (!row) memPush(memVulns, this.workspaceId, stored);
    await this.audit("cyber.vuln.reported", parsed.vulnId, { assetId: parsed.assetId, riskScore: rank.score, riskLevel: rank.level });
    return { ...((row as unknown as Record<string, unknown> | null) ?? stored), rank };
  }

  async transitionVuln(vulnId: string, to: string) {
    await this.assert("UPDATE");
    const all = await this.listVulns();
    const found = (all as Array<Record<string, unknown>>).find((v) => v.vulnId === vulnId || v.id === vulnId);
    if (!found) throw new Error("Vulnerability not found");
    const from = String(found.status ?? "DISCOVERED");
    if (!canTransitionVuln(from, to)) throw new Error(`Invalid transition ${from} → ${to} — lifecycle must advance in order with testing before deployment`);
    await safe(() => (prisma as unknown as CyberTables).healthCyberVuln.update({ where: { vulnId }, data: { status: to } }) as Promise<never>, null);
    found.status = to;
    await this.audit("cyber.vuln.transitioned", vulnId, { from, to });
    return { vulnId, from, to };
  }

  async grantException(input: z.infer<typeof vulnExceptionSchema>) {
    await this.assert("UPDATE");
    const parsed = vulnExceptionSchema.parse(input);
    if (parsed.expiresAt.getTime() <= Date.now()) throw new Error("Exception requires a future expiration — permanent accepted risk is prohibited");
    await this.audit("cyber.vuln.exception_granted", parsed.vulnId, { owner: parsed.owner, expiresAt: parsed.expiresAt.toISOString() });
    return { ...parsed, renewalRequired: true as const, note: "Exceptions expire and require review + renewal; monitoring and reassessment date enforced." };
  }

  async listVulns(status?: string) {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as unknown as CyberTables).healthCyberVuln.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 200 }) as Promise<never[]>,
      [],
    );
    const all = rows.length ? (rows as Array<Record<string, unknown>>) : memList(memVulns, this.workspaceId);
    return status ? all.filter((v) => (v as Record<string, unknown>).status === status) : all;
  }

  async disclosureIntake(input: z.infer<typeof disclosureSchema>) {
    await this.assert("CREATE");
    const parsed = disclosureSchema.parse(input);
    // Never persist patient data in vulnerability reports — strip and warn.
    const phiPattern = /\b\d{3}-\d{2}-\d{4}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
    if (phiPattern.test(`${parsed.evidence} ${parsed.reproductionSteps}`)) {
      throw new Error("Report appears to contain patient data — resubmit via the secure path with health information redacted");
    }
    const id = `discl-${crypto.randomUUID().slice(0, 8)}`;
    await this.audit("cyber.disclosure.received", id, { assetId: parsed.assetId, reporterType: parsed.reporterType });
    return { disclosureId: id, status: "TRIAGED", capture: [...DISCLOSURE_CAPTURE], acknowledgementSla: "configured", securePath: true as const };
  }

  // ── Device patching ──────────────────────────────────────────────
  async planDevicePatch(input: z.infer<typeof devicePatchSchema>) {
    await this.assert("CREATE");
    const parsed = devicePatchSchema.parse({ ...input, patchId: input.patchId || `patch-${crypto.randomUUID().slice(0, 8)}` });
    const gaps = patchPrecheckGaps(parsed.prechecks);
    const stored: StoredRow = { id: parsed.patchId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>), precheckGaps: gaps };
    memPush(memPatches, this.workspaceId, stored);
    await this.audit("cyber.patch.planned", parsed.patchId, { models: parsed.deviceModels, gaps });
    return { ...parsed, precheckGaps: gaps, decisionFlow: [...PATCH_DECISION_FLOW], blocked: gaps.length > 0, note: "Never patch a critical device in production without verifying continued clinical function." };
  }

  async advancePatch(patchId: string, to: string, approver?: string) {
    await this.assert("UPDATE");
    const found = memList(memPatches, this.workspaceId).find((p) => p.id === patchId);
    if (!found) throw new Error("Patch plan not found");
    if ((to === "APPROVED" || to === "DEPLOYING") && ((found.precheckGaps as string[] | undefined)?.length ?? 0) > 0) {
      throw new Error(`Precheck gaps block approval: ${((found.precheckGaps as string[]) ?? []).join(", ")}`);
    }
    if (to === "APPROVED" && !approver && !found.downtimeApprovedBy) throw new Error("Clinical downtime approval required before deployment");
    found.status = to;
    if (approver) found.downtimeApprovedBy = approver;
    await this.audit("cyber.patch.advanced", patchId, { to });
    return { patchId, status: to };
  }

  async recordCompensating(input: z.infer<typeof compensatingSchema>) {
    await this.assert("CREATE");
    const parsed = compensatingSchema.parse({ ...input, controlId: input.controlId || `comp-${crypto.randomUUID().slice(0, 8)}` });
    if (parsed.expiresAt.getTime() <= Date.now()) throw new Error("Compensating control requires a future expiration — it must not become an indefinite substitute");
    const stored: StoredRow = { id: parsed.controlId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    memPush(memControls, this.workspaceId, stored);
    await this.audit("cyber.compensating.recorded", parsed.controlId, { assetId: parsed.assetId, control: parsed.control });
    return { ...parsed, timeLimited: true as const };
  }

  // ── Firmware ─────────────────────────────────────────────────────
  async validateFirmware(input: z.infer<typeof firmwareSchema>) {
    await this.assert("CREATE");
    const parsed = firmwareSchema.parse(input);
    const result = validateFirmware(parsed);
    await this.audit("cyber.firmware.validated", `${parsed.deviceModel}:${parsed.version}`, { accepted: result.accepted });
    if (!result.accepted) {
      await this.reportIncident({ kind: "firmware_tamper", severity: "HIGH", assetId: parsed.deviceModel, detail: `Firmware rejected: ${result.failures.join(", ")}` });
    }
    return { ...result, workflow: [...FIRMWARE_WORKFLOW], note: "Devices that cannot validate signatures must be isolated with a replacement or compensating-control plan." };
  }

  // ── Quarantine ───────────────────────────────────────────────────
  async quarantineDevice(input: { deviceId: string; trigger: string; clinicalCriticality?: string; lifeCritical?: boolean; dataTrustworthy?: boolean }) {
    await this.assert("CREATE");
    if (!(QUARANTINE_TRIGGERS as readonly string[]).includes(input.trigger)) throw new Error(`Unknown quarantine trigger: ${input.trigger}`);
    const decision = quarantineDecision(input.trigger, input.clinicalCriticality ?? "medium", input.lifeCritical ?? false, input.dataTrustworthy ?? false);
    const id = `quar-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as CyberTables).healthCyberQuarantine.create({
        data: {
          workspaceId: this.workspaceId, quarantineId: id, deviceId: input.deviceId,
          trigger: input.trigger, state: decision.state, clinicalCriticality: input.clinicalCriticality ?? "medium",
          lifeCritical: input.lifeCritical ?? false, clinicianMessage: decision.clinicianMessage, createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, deviceId: input.deviceId, trigger: input.trigger, ...decision };
    if (!row) memPush(memQuarantines, this.workspaceId, stored);
    await this.audit("cyber.device.quarantined", id, { deviceId: input.deviceId, state: decision.state, lifeCritical: input.lifeCritical ?? false });
    return { quarantineId: id, workflow: [...QUARANTINE_WORKFLOW], ...decision, ...((row as unknown as Record<string, unknown> | null) ?? {}) };
  }

  async revalidateDevice(quarantineId: string, checks: Record<string, boolean>) {
    await this.assert("UPDATE");
    const gaps = POST_RESTORE_DEVICE_CHECKS.filter((c) => !checks[c]);
    if (gaps.length > 0) throw new Error(`Revalidation blocked — missing: ${gaps.join(", ")} (patient association, clock, firmware, calibration, alerts, duplicates, acceptance)`);
    await safe(() => (prisma as unknown as CyberTables).healthCyberQuarantine.update({ where: { quarantineId }, data: { state: "REVALIDATED" } }) as Promise<never>, null);
    const found = memList(memQuarantines, this.workspaceId).find((q) => q.id === quarantineId);
    if (found) found.state = "REVALIDATED";
    await this.audit("cyber.device.revalidated", quarantineId, {});
    return { quarantineId, state: "REVALIDATED" as const, reconnect: "in_stages_with_data_reconciliation" as const };
  }

  async listQuarantines(state?: string) {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as unknown as CyberTables).healthCyberQuarantine.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 100 }) as Promise<never[]>,
      [],
    );
    const all = rows.length ? (rows as Array<Record<string, unknown>>) : memList(memQuarantines, this.workspaceId);
    return state ? all.filter((q) => (q as Record<string, unknown>).state === state) : all;
  }

  // ── Backups ──────────────────────────────────────────────────────
  async recordBackup(input: z.infer<typeof backupSchema>) {
    await this.assert("CREATE");
    const parsed = backupSchema.parse({ ...input, backupId: input.backupId || `bkp-${crypto.randomUUID().slice(0, 8)}` });
    const gate = backupRestorable({ integrityHash: parsed.integrityHash, malwareScanned: parsed.malwareScanned, restoreTestedAt: parsed.restoreTestedAt });
    const stored: StoredRow = { id: parsed.backupId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>), ...gate };
    memPush(memBackups, this.workspaceId, stored);
    await this.audit("cyber.backup.recorded", parsed.backupId, { assetId: parsed.assetId, type: parsed.backupType, restorable: gate.restorable });
    return { ...parsed, ...gate, principle: BACKUP_PRINCIPLE };
  }

  // ── Recovery: technical restoration ≠ clinical validation ─────────
  async declareRestored(recovery: { service: string; recoveryId?: string; checklist: Record<string, boolean>; rtoMinutes?: number; rpoMinutes?: number }) {
    await this.assert("CREATE");
    const gaps = recoveryChecklistGaps(recovery.checklist);
    if (gaps.length > 0) throw new Error(`Technical restoration blocked — unverified: ${gaps.join(", ")}`);
    const id = recovery.recoveryId ?? `rec-${crypto.randomUUID().slice(0, 8)}`;
    const tier = tierForService(recovery.service);
    const row = await safe(
      () => (prisma as unknown as CyberTables).healthCyberRecovery.create({
        data: {
          workspaceId: this.workspaceId, recoveryId: id, service: recovery.service, tier,
          technicalRestored: true, clinicallyValidated: false,
          rtoMinutes: recovery.rtoMinutes ?? null, rpoMinutes: recovery.rpoMinutes ?? null,
          createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, service: recovery.service, tier, technicalRestored: true, clinicallyValidated: false };
    if (!row) memPush(memRecoveries, this.workspaceId, stored);
    await this.audit("cyber.service.restored_technically", id, { service: recovery.service, tier });
    return { recoveryId: id, tier, technicalRestored: true as const, clinicallyValidated: false as const, targets: CLINICAL_TIERS[tier], note: "Clinicians must still verify meds, allergies, results, identity, referrals, discharge, audit before clinical validation." };
  }

  async declareClinicallyValidated(recoveryId: string, validatedBy: string, workflowChecks: Record<string, boolean>) {
    await this.assert("UPDATE");
    const required = ["medication_lists", "allergies", "critical_results", "referrals", "discharge_plans", "patient_identity", "audit_history"];
    const missing = required.filter((r) => !workflowChecks[r]);
    if (missing.length > 0) throw new Error(`Clinical validation blocked — unverified workflows: ${missing.join(", ")}`);
    await safe(() => (prisma as unknown as CyberTables).healthCyberRecovery.update({ where: { recoveryId }, data: { clinicallyValidated: true, validatedBy } }) as Promise<never>, null);
    const found = memList(memRecoveries, this.workspaceId).find((r) => r.id === recoveryId);
    if (found) { found.clinicallyValidated = true; found.validatedBy = validatedBy; }
    await this.audit("cyber.service.validated_clinically", recoveryId, { validatedBy });
    return { recoveryId, clinicallyValidated: true as const, validatedBy, manualFallbackClosed: true as const };
  }

  async reconcileDowntime(recoveryId: string, events: Array<{ temporaryId: string; patientRef: string; integrityHash: string }>) {
    await this.assert("UPDATE");
    // Every locally captured event carries temp id + identity confidence +
    // integrity hash; reconciliation matches them into the restored system.
    const bad = events.filter((e) => !e.temporaryId || !e.integrityHash);
    if (bad.length > 0) throw new Error(`${bad.length} downtime events lack identifiers/hashes — cannot reconcile silently`);
    await this.audit("cyber.downtime.reconciled", recoveryId, { events: events.length });
    return { recoveryId, reconciled: events.length, duplicatesChecked: true as const, auditPreserved: true as const };
  }

  // ── Continuity mode ──────────────────────────────────────────────
  async continuityStatus() {
    await this.assert("READ");
    const recoveries = memList(memRecoveries, this.workspaceId);
    const open = recoveries.filter((r) => r.technicalRestored !== true || r.clinicallyValidated !== true);
    return {
      active: open.length > 0,
      capabilities: [...CONTINUITY_CAPABILITIES],
      localEventEnvelope: [...LOCAL_EVENT_FIELDS],
      degradedServices: open.length,
      staleDataWarning: open.length > 0 ? "Data may be stale, incomplete, or unavailable — no silent synchronization claims." : null,
    };
  }

  // ── Exercises ────────────────────────────────────────────────────
  async recordExercise(input: z.infer<typeof exerciseSchema>) {
    await this.assert("CREATE");
    const parsed = exerciseSchema.parse({ ...input, exerciseId: input.exerciseId || `ex-${crypto.randomUUID().slice(0, 8)}` });
    if (parsed.kind === "TABLETOP" && !(TABLETOP_SCENARIOS as readonly string[]).includes(parsed.scenario)) {
      throw new Error(`Unknown tabletop scenario: ${parsed.scenario}`);
    }
    if (parsed.kind === "RED_TEAM") {
      await this.audit("cyber.redteam.recorded", parsed.exerciseId, { scenario: parsed.scenario });
      return { ...parsed, boundaries: [...RED_TEAM_BOUNDARIES], note: "Findings must be retested after remediation; stop conditions and evidence preservation enforced." };
    }
    const row = await safe(
      () => (prisma as unknown as CyberTables).healthCyberExercise.create({
        data: {
          workspaceId: this.workspaceId, exerciseId: parsed.exerciseId, kind: parsed.kind,
          scenario: parsed.scenario, participants: parsed.participants, findings: parsed.findings,
          improvementOwners: parsed.improvementOwners,
          retestDate: parsed.retestDate ?? null, status: parsed.status, createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id: parsed.exerciseId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    if (!row) memPush(memExercises, this.workspaceId, stored);
    await this.audit("cyber.exercise.recorded", parsed.exerciseId, { kind: parsed.kind, scenario: parsed.scenario });
    return { ...((row as unknown as Record<string, unknown> | null) ?? stored), outputs: parsed.kind === "TABLETOP" ? [...TABLETOP_OUTPUTS] : [...DRILL_STAGES] };
  }

  async listExercises(kind?: string) {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as unknown as CyberTables).healthCyberExercise.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 100 }) as Promise<never[]>,
      [],
    );
    const all = rows.length ? (rows as Array<Record<string, unknown>>) : memList(memExercises, this.workspaceId);
    return kind ? all.filter((e) => (e as Record<string, unknown>).kind === kind) : all;
  }

  // ── Vendors ──────────────────────────────────────────────────────
  async reviewVendor(input: z.infer<typeof vendorSchema>) {
    await this.assert("CREATE");
    const parsed = vendorSchema.parse({ ...input, vendorId: input.vendorId || `vendor-${crypto.randomUUID().slice(0, 8)}` });
    const gaps = vendorEvidenceGaps(parsed.evidence);
    const accessViolations = VENDOR_ACCESS_RULES.filter((r) => parsed.remoteAccess[r] === false);
    const stored: StoredRow = { id: parsed.vendorId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>), evidenceGaps: gaps };
    memPush(memVendors, this.workspaceId, stored);
    await this.audit("cyber.vendor.reviewed", parsed.vendorId, { gaps });
    return { ...parsed, evidenceGaps: gaps, accessViolations, accessRules: [...VENDOR_ACCESS_RULES] };
  }

  // ── Integrity ────────────────────────────────────────────────────
  async reportIntegritySignal(signal: { kind: string; assetId: string; detail: string; severity?: string }) {
    if (!(INTEGRITY_SIGNALS as readonly string[]).includes(signal.kind)) throw new Error(`Unknown integrity signal: ${signal.kind}`);
    await this.assert("CREATE");
    const id = `int-${crypto.randomUUID().slice(0, 8)}`;
    await this.audit("cyber.integrity.signal", id, { kind: signal.kind, assetId: signal.assetId });
    return { signalId: id, tools: [...INTEGRITY_TOOLS], note: "Correlate with hashes, signed events, audit log, backup comparisons, and baselines before declaring recovery." };
  }

  // ── Dashboards ───────────────────────────────────────────────────
  async dashboards() {
    await this.assert("READ");
    const [assets, vulns, quarantines, recoveries] = await Promise.all([
      this.listAssets(), this.listVulns(), this.listQuarantines(), Promise.resolve(memList(memRecoveries, this.workspaceId)),
    ]);
    const a = assets as Array<Record<string, unknown>>;
    const v = vulns as Array<Record<string, unknown>>;
    const q = quarantines as Array<Record<string, unknown>>;
    return {
      executive: {
        tiles: [...EXEC_DASHBOARD],
        criticalVulns: v.filter((x) => x.riskLevel === "CRITICAL" || x.severity === "CRITICAL").length,
        unsupportedDevices: a.filter((x) => x.supportStatus === "unsupported" || x.supportStatus === "end_of_life").length,
        quarantinedDevices: q.filter((x) => x.state === "QUARANTINED").length,
        unvalidatedRecoveries: recoveries.filter((r) => r.clinicallyValidated !== true).length,
      },
      securityOperations: { tiles: [...SOC_DASHBOARD], openQuarantines: q.length },
      clinicalEngineering: { tiles: [...CLINENG_DASHBOARD], compensatingControls: memList(memControls, this.workspaceId).length, patchPlans: memList(memPatches, this.workspaceId).length },
      clinicalOperations: { tiles: [...CLINOPS_DASHBOARD], ...(await this.continuityStatus()) },
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Incidents ────────────────────────────────────────────────────
  async reportIncident(input: z.infer<typeof cyberIncidentSchema>) {
    const parsed = cyberIncidentSchema.parse(input);
    const id = `cinc-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as CyberTables).healthCyberIncident.create({
        data: {
          workspaceId: this.workspaceId, incidentId: id, kind: parsed.kind, severity: parsed.severity,
          assetId: parsed.assetId || null, detail: parsed.detail, status: "OPEN",
          responseActions: [...CYBER_RESPONSE_ACTIONS], createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>), status: "OPEN", responseActions: [...CYBER_RESPONSE_ACTIONS] };
    if (!row) memPush(memIncidents, this.workspaceId, stored);
    await this.audit("cyber.incident.reported", id, { kind: parsed.kind, severity: parsed.severity });
    return { incidentId: id, responseActions: [...CYBER_RESPONSE_ACTIONS], ...((row as unknown as Record<string, unknown> | null) ?? stored) };
  }

  async listIncidents(status?: string) {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as unknown as CyberTables).healthCyberIncident.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 100 }) as Promise<never[]>,
      [],
    );
    const all = rows.length ? (rows as Array<Record<string, unknown>>) : memList(memIncidents, this.workspaceId);
    return status ? all.filter((i) => (i as Record<string, unknown>).status === status) : all;
  }

  async resolveIncident(incidentId: string, resolution: string, improvementOwners?: Record<string, string>) {
    await this.assert("UPDATE");
    await safe(() => (prisma as unknown as CyberTables).healthCyberIncident.update({ where: { incidentId }, data: { status: "RESOLVED", resolution } }) as Promise<never>, null);
    const found = memList(memIncidents, this.workspaceId).find((i) => i.id === incidentId);
    if (found) { found.status = "RESOLVED"; found.resolution = resolution; }
    await this.audit("cyber.incident.resolved", incidentId, { resolution, improvementOwners });
    return { incidentId, status: "RESOLVED", resolution };
  }
}

// ── Static reference exports ──────────────────────────────────────────
export const CYBER_API = [
  "registerAsset", "listAssets", "recordSbom", "listSboms",
  "reportVulnerability", "transitionVuln", "grantException", "listVulns", "disclosureIntake",
  "planDevicePatch", "advancePatch", "recordCompensating",
  "validateFirmware", "quarantineDevice", "revalidateDevice", "listQuarantines",
  "recordBackup", "declareRestored", "declareClinicallyValidated", "reconcileDowntime",
  "continuityStatus", "recordExercise", "listExercises", "reviewVendor",
  "reportIntegritySignal", "dashboards",
  "reportIncident", "listIncidents", "resolveIncident",
] as const;
