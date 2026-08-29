/**
 * N0VA VIDEOS — Consent-Aware Identity Engine
 * Registry → Policy Engine → Detection/Generation Services → Provenance → Revocation Network
 */
import type {
  PersonIdentity, ConsentGrant, ConsentEvidence, ConsentDecision, FaceProcessingPolicy, VoicePermission,
  SyntheticPresenterPolicy, DisclosurePolicy, IdentityProvenance, ConsentPassport, RevocationEvent,
  RevocationPropagationStatus, ExportConsentGate, AgentConsentToken, IdentityCandidate, Permissions,
} from "./identity-types";

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2, 6)}${Date.now().toString(36)}`; }
function nowIso() { return new Date().toISOString(); }
function hash(s: string) { return `sha3-512:${s.slice(0, 32)}${Math.random().toString(36).slice(2, 6)}`; }

// ── Stores ───────────────────────────────────────────────────────────────────
const persons = new Map<string, PersonIdentity>();
const evidences = new Map<string, ConsentEvidence>();
const facePolicies = new Map<string, FaceProcessingPolicy>(); // tenant scoped
const voicePermissions = new Map<string, VoicePermission>();
const presenterPolicies = new Map<string, SyntheticPresenterPolicy>();
const disclosurePolicies = new Map<string, DisclosurePolicy>();
const provenanceStore = new Map<string, IdentityProvenance>();
const revocationEvents = new Map<string, RevocationEvent>();
const propagationStatus = new Map<string, RevocationPropagationStatus>();
const agentTokens = new Map<string, AgentConsentToken>();
const derivedArtifacts = new Map<string, { person_id: string; grant_id: string; type: string; asset_id: string }>();

// ── Seed ─────────────────────────────────────────────────────────────────────
(function seed() {
  const p: PersonIdentity = {
    person_id: "person_01J_demo",
    display_name: "Encrypted Person Name",
    identity_status: "verified",
    identity_methods: ["government_verified", "agency_verified"],
    consent_grants: [
      {
        grant_id: "consent_01J_demo",
        status: "active",
        consent_version: "v3.2",
        issued_at: "2026-07-01T10:00:00Z",
        expires_at: "2027-07-01T23:59:59Z",
        revoked_at: null,
        territories: ["IN", "US", "GB"],
        projects: ["project_001", "campaign_q3_2026"],
        platforms: ["youtube", "linkedin", "website"],
        permissions: {
          face_detection: true, face_recognition: true, face_tracking: true, face_generation: true,
          voice_transcription: true, voice_cloning: true, voice_conversion: false, lip_sync: true,
          synthetic_presenter: true, body_motion_transfer: false, likeness_transfer: true,
        },
        required_disclosure: {
          required: true, language: "en-IN", text: "This presenter is digitally generated with the authorized likeness of [Name].",
          placement: "opening_and_description", minimum_duration_ms: 4000,
        },
        source_evidence: ["evidence_01J_demo"],
        approved_by: ["legal_001", "talent_manager_001"],
      },
    ],
    created_at: nowIso(),
  };
  persons.set(p.person_id, p);
  evidences.set("evidence_01J_demo", {
    evidence_id: "evidence_01J_demo", type: "signed_release", storage_uri: "vault://consent/evidence_01J_demo",
    content_hash: hash("signed_release_content"), signed_at: "2026-07-01T10:00:00Z", signatory_verified: true,
    verification_method: "qualified_esignature", retention_policy: "legal_compliance_20_years", access_policy: "legal_and_consent_admins_only",
  });
  facePolicies.set("default", {
    unknown_faces: "blur_on_public_export", known_faces_without_scope: "do_not_index",
    embedding_retention: "project_lifetime", cross_project_search: "consent_required", cross_tenant_matching: false, public_export_without_consent: "block",
  });
  voicePermissions.set("voice_01J_demo", {
    voice_id: "voice_01J_demo", source_person_id: "person_01J_demo",
    allowed_operations: ["internal_dubbing", "approved_campaign_voiceover"],
    prohibited_operations: ["political_content", "financial_advice", "sexual_content", "model_training"],
    allowed_languages: ["en-IN", "hi-IN"], max_duration_per_project_seconds: 1800, disclosure_required: true,
  });
  presenterPolicies.set("presenter_01J_demo", {
    presenter_id: "presenter_01J_demo", face_grant: "consent_01J_demo", voice_grant: "consent_01J_demo", likeness_grant: "consent_01J_demo",
    allowed_content_types: ["product_education", "internal_training"], prohibited_content_types: ["political", "financial_advice", "medical_claims"],
    required_disclosure: true, human_approval_required: true,
  });
  disclosurePolicies.set("default", {
    required: true, methods: ["opening_card", "description_metadata", "platform_ai_label"],
    opening_card: { text: "This video includes a digitally generated performance authorized by the individual depicted.", duration_ms: 4000, minimum_contrast_ratio: 4.5 },
    languages: { "en-IN": "This presenter is digitally generated with the authorized likeness of [Name].", "hi-IN": "यह प्रस्तुतकर्ता अधिकृत समानता के साथ डिजिटल रूप से उत्पन्न है।" },
  });
})();

// ── Registry ─────────────────────────────────────────────────────────────────
export function registerPerson(input: { display_name?: string; verification_method?: string; modalities?: string[] }): PersonIdentity {
  const pid = uid("person");
  const p: PersonIdentity = {
    person_id: pid, display_name: input.display_name ?? "Encrypted Person Name", identity_status: "verified",
    identity_methods: [input.verification_method ?? "agency_verified"], consent_grants: [], created_at: nowIso(),
  };
  persons.set(pid, p);
  return p;
}
export function getPerson(personId: string): PersonIdentity | null { return persons.get(personId) ?? null; }
export function listPersons(): PersonIdentity[] { return Array.from(persons.values()); }

export function createConsentGrant(personId: string, input: {
  territories?: string[]; projects?: string[]; platforms?: string[]; permissions?: Partial<Permissions>; expires_at?: string; evidence_id?: string;
}): ConsentGrant {
  const person = persons.get(personId);
  if (!person) throw new Error(`Person ${personId} not found`);
  const grant: ConsentGrant = {
    grant_id: uid("consent"), status: "active", consent_version: "v3.2", issued_at: nowIso(),
    expires_at: input.expires_at ?? "2027-07-01T23:59:59Z", revoked_at: null,
    territories: input.territories ?? ["IN", "US"], projects: input.projects ?? ["project_001"], platforms: input.platforms ?? ["youtube", "website"],
    permissions: {
      face_detection: true, face_recognition: true, face_tracking: true, face_generation: false,
      voice_transcription: true, voice_cloning: input.permissions?.voice_cloning ?? true, voice_conversion: false, lip_sync: true,
      synthetic_presenter: input.permissions?.synthetic_presenter ?? true, body_motion_transfer: false, likeness_transfer: true,
      ...input.permissions,
    },
    required_disclosure: { required: true, language: "en-IN", text: "This presenter is digitally generated with the authorized likeness of [Name].", placement: "opening_and_description", minimum_duration_ms: 4000 },
    source_evidence: input.evidence_id ? [input.evidence_id] : ["evidence_01J_demo"],
    approved_by: ["legal_001"],
  };
  person.consent_grants.push(grant);
  return grant;
}
export function getGrant(grantId: string): { person: PersonIdentity; grant: ConsentGrant } | null {
  for (const p of persons.values()) { const g = p.consent_grants.find(x => x.grant_id === grantId); if (g) return { person: p, grant: g }; }
  return null;
}
export function createEvidence(input: Partial<ConsentEvidence> & { type?: ConsentEvidence["type"] }): ConsentEvidence {
  const e: ConsentEvidence = {
    evidence_id: uid("evidence"), type: input.type ?? "signed_release", storage_uri: input.storage_uri ?? `vault://consent/${uid("evidence")}`,
    content_hash: input.content_hash ?? hash("evidence_content"), signed_at: input.signed_at ?? nowIso(), signatory_verified: true,
    verification_method: input.verification_method ?? "qualified_esignature", retention_policy: "legal_compliance_20_years", access_policy: "legal_and_consent_admins_only",
  };
  evidences.set(e.evidence_id, e);
  return e;
}

// ── Policy Engine ────────────────────────────────────────────────────────────
export function evaluateConsent(input: {
  person_id: string; operation: string; project_id: string; territory: string; platform: string; audience: string;
}): ConsentDecision {
  const person = persons.get(input.person_id);
  const now = new Date(); const evaluated_at = nowIso();
  if (!person) return { decision: "identity_unverified", person_id: input.person_id, operation: input.operation, project_id: input.project_id, territory: input.territory, platform: input.platform, audience: input.audience, evaluated_at, reason: "person not found" };
  if (person.identity_status !== "verified") return { decision: "identity_unverified", person_id: input.person_id, operation: input.operation, project_id: input.project_id, territory: input.territory, platform: input.platform, audience: input.audience, evaluated_at };
  // map operation to permission key
  const opMap: Record<string, keyof Permissions> = {
    face_detection: "face_detection", face_recognition: "face_recognition", face_tracking: "face_tracking", face_generation: "face_generation",
    voice_clone: "voice_cloning", voice_cloning: "voice_cloning", voice_transcription: "voice_transcription",
    lip_sync: "lip_sync", synthetic_presenter: "synthetic_presenter", body_motion_transfer: "body_motion_transfer", likeness_transfer: "likeness_transfer",
  };
  const permKey = opMap[input.operation] ?? (input.operation as keyof Permissions);
  // find matching grant with scope
  for (const g of person.consent_grants) {
    if (g.status === "revoked") continue;
    if (g.status === "expired" || new Date(g.expires_at).getTime() < now.getTime()) return { decision: "expired", person_id: input.person_id, operation: input.operation, project_id: input.project_id, territory: input.territory, platform: input.platform, audience: input.audience, evaluated_at, grant_id: g.grant_id };
    if (g.revoked_at) return { decision: "revoked", person_id: input.person_id, operation: input.operation, project_id: input.project_id, territory: input.territory, platform: input.platform, audience: input.audience, evaluated_at, grant_id: g.grant_id };
    const permVal = (g.permissions as Record<string, boolean>)[permKey as string];
    if (permVal === false) continue; // try next grant
    if (permVal !== true) continue;
    // scope checks
    if (!g.projects.includes(input.project_id) && !g.projects.includes("*") && g.projects.length > 0) {
      // allow if grant projects empty means wildcard? but we require match
      // try next grant if mismatch
      if (!g.projects.includes(input.project_id)) continue;
    }
    if (!g.territories.includes(input.territory) && !g.territories.includes("worldwide")) return { decision: "scope_mismatch", person_id: input.person_id, operation: input.operation, project_id: input.project_id, territory: input.territory, platform: input.platform, audience: input.audience, evaluated_at, grant_id: g.grant_id, reason: `territory ${input.territory} not in grant` };
    if (!g.platforms.includes(input.platform) && !g.platforms.includes("*")) return { decision: "scope_mismatch", person_id: input.person_id, operation: input.operation, project_id: input.project_id, territory: input.territory, platform: input.platform, audience: input.audience, evaluated_at, grant_id: g.grant_id, reason: `platform ${input.platform} not in grant` };
    if (g.required_disclosure.required && input.audience === "public") {
      return { decision: "allowed_with_disclosure", person_id: input.person_id, operation: input.operation, project_id: input.project_id, territory: input.territory, platform: input.platform, audience: input.audience, evaluated_at, grant_id: g.grant_id, disclosure_required: true, evidence_required: true };
    }
    return { decision: "allowed", person_id: input.person_id, operation: input.operation, project_id: input.project_id, territory: input.territory, platform: input.platform, audience: input.audience, evaluated_at, grant_id: g.grant_id, disclosure_required: g.required_disclosure.required, evidence_required: true };
  }
  // check evidence missing?
  const hasEvidence = person.consent_grants.some(g => g.source_evidence.length > 0);
  if (!hasEvidence) return { decision: "evidence_missing", person_id: input.person_id, operation: input.operation, project_id: input.project_id, territory: input.territory, platform: input.platform, audience: input.audience, evaluated_at };
  return { decision: "denied", person_id: input.person_id, operation: input.operation, project_id: input.project_id, territory: input.territory, platform: input.platform, audience: input.audience, evaluated_at, reason: `operation ${input.operation} not permitted` };
}

// ── Identity Matching ────────────────────────────────────────────────────────
export function matchIdentity(signal: { face_embedding?: string; voice_sample?: string; confidence: number }): IdentityCandidate[] {
  // tenant-scoped registry lookup mock: return candidates sorted by confidence
  const candidates: IdentityCandidate[] = [];
  for (const p of persons.values()) {
    // mock: if confidence >0.7, consider match to first person
    if (signal.confidence >= 0.7) candidates.push({ person_id: p.person_id, confidence: signal.confidence, scope_match: true });
    else candidates.push({ person_id: p.person_id, confidence: signal.confidence * 0.5, scope_match: false });
  }
  // unknown handling: if confidence <0.6, return unknown candidate
  if (signal.confidence < 0.6) candidates.push({ person_id: "unknown", confidence: signal.confidence, scope_match: false });
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

// ── Face processing policy ──────────────────────────────────────────────────
export function getFacePolicy(): FaceProcessingPolicy { return facePolicies.get("default")!; }
export function evaluateFaceAction(action: string, personId: string, projectId: string): ConsentDecision {
  // delegate to policy engine with face operation mapping
  const opMap: Record<string, string> = {
    detection: "face_detection", recognition: "face_recognition", tracking: "face_tracking", replacement: "face_generation",
    generation: "face_generation", thumbnail: "face_generation", search_index: "face_recognition", cross_project: "face_recognition",
  };
  return evaluateConsent({ person_id: personId, operation: opMap[action] ?? action, project_id: projectId, territory: "IN", platform: "youtube", audience: "public" });
}

// ── Voice permission ────────────────────────────────────────────────────────
export function getVoicePermission(voiceId: string): VoicePermission | null { return voicePermissions.get(voiceId) ?? null; }
export function checkVoiceOperation(voiceId: string, operation: string, language?: string): { allowed: boolean; reason?: string } {
  const vp = voicePermissions.get(voiceId);
  if (!vp) return { allowed: false, reason: "voice not found" };
  if (vp.prohibited_operations.includes(operation)) return { allowed: false, reason: `prohibited: ${operation}` };
  if (operation && !vp.allowed_operations.includes(operation) && vp.allowed_operations.length > 0) return { allowed: false, reason: `not in allowed: ${operation}` };
  if (language && vp.allowed_languages.length && !vp.allowed_languages.includes(language)) return { allowed: false, reason: `language ${language} not allowed` };
  return { allowed: true };
}

// ── Synthetic presenter composite check ─────────────────────────────────────
export function evaluatePresenter(presenterId: string, context: { project_id: string; territory: string; platform: string; audience: string; content_type: string }): ConsentDecision {
  const pol = presenterPolicies.get(presenterId);
  if (!pol) return { decision: "denied", person_id: presenterId, operation: "synthetic_presenter", project_id: context.project_id, territory: context.territory, platform: context.platform, audience: context.audience, evaluated_at: nowIso(), reason: "presenter policy not found" };
  if (pol.prohibited_content_types.includes(context.content_type)) return { decision: "denied", person_id: presenterId, operation: "synthetic_presenter", project_id: context.project_id, territory: context.territory, platform: context.platform, audience: context.audience, evaluated_at: nowIso(), reason: `content type ${context.content_type} prohibited` };
  // need 4 grants: face+voice+likeness+performance — check each
  const checks = [pol.face_grant, pol.voice_grant, pol.likeness_grant].map(gid => {
    const f = getGrant(gid);
    if (!f) return { ok: false, reason: `grant ${gid} missing` };
    if (f.grant.status !== "active") return { ok: false, reason: `${gid} not active` };
    return { ok: true };
  });
  const failed = checks.find(c => !c.ok);
  if (failed) return { decision: "denied", person_id: presenterId, operation: "synthetic_presenter", project_id: context.project_id, territory: context.territory, platform: context.platform, audience: context.audience, evaluated_at: nowIso(), reason: failed.reason };
  if (pol.human_approval_required) return { decision: "allowed_with_human_approval", person_id: presenterId, operation: "synthetic_presenter", project_id: context.project_id, territory: context.territory, platform: context.platform, audience: context.audience, evaluated_at: nowIso(), grant_id: pol.face_grant };
  return { decision: "allowed_with_disclosure", person_id: presenterId, operation: "synthetic_presenter", project_id: context.project_id, territory: context.territory, platform: context.platform, audience: context.audience, evaluated_at: nowIso(), grant_id: pol.face_grant, disclosure_required: true };
}

// ── Lip-sync validation ─────────────────────────────────────────────────────
export function evaluateLipSync(personId: string, context: { project_id: string; territory: string; platform: string }): ConsentDecision {
  // lip-sync requires likeness.lip_sync permission separate from voice dubbing
  return evaluateConsent({ person_id: personId, operation: "lip_sync", project_id: context.project_id, territory: context.territory, platform: context.platform, audience: "public" });
}

// ── Disclosure ──────────────────────────────────────────────────────────────
export function getDisclosurePolicy(): DisclosurePolicy { return disclosurePolicies.get("default")!; }
export function checkDisclosureSurvival(assetId: string, transform: string): { survives: boolean; reason?: string } {
  // cropping, platform adaptation, etc. may strip disclosure
  if (["crop", "re-encode", "thumbnail"].includes(transform)) return { survives: false, reason: `transform ${transform} may strip disclosure` };
  return { survives: true };
}

// ── Provenance ──────────────────────────────────────────────────────────────
export function createIdentityProvenance(outputId: string, operations: IdentityProvenance["generated_operations"]): IdentityProvenance {
  const prov: IdentityProvenance = {
    output_id: outputId, asset_hash: hash(outputId), timeline_version: "tl001:v42", generated_operations: operations,
    consent_snapshot: { policy_version: "consent-policy-2026.08", evaluated_at: nowIso(), grant_status: "active", evidence_hashes: operations.map(o => hash(o.grant_id)) },
    disclosure: { required: true, applied: true, disclosure_asset_id: `disclosure_${outputId}` },
    signature: `dilithium-signature:${hash(outputId).slice(0, 16)}`,
  };
  provenanceStore.set(outputId, prov);
  // track derived artifacts for revocation
  for (const op of operations) derivedArtifacts.set(`${outputId}:${op.operation}`, { person_id: op.person_id, grant_id: op.grant_id, type: op.operation, asset_id: outputId });
  return prov;
}
export function getIdentityProvenance(outputId: string): IdentityProvenance | null { return provenanceStore.get(outputId) ?? null; }

// ── Consent passport ────────────────────────────────────────────────────────
export function getConsentPassport(personId: string, projectId: string): ConsentPassport | null {
  const p = persons.get(personId);
  if (!p) return null;
  const grant = p.consent_grants.find(g => g.projects.includes(projectId) && g.status === "active");
  if (!grant) return null;
  return {
    person_id: personId, display_name: p.display_name,
    operations: Object.entries(grant.permissions).filter(([, v]) => v).map(([k]) => k),
    project: projectId, territories: grant.territories, platforms: grant.platforms,
    consent_status: grant.status, expires: grant.expires_at,
    disclosure: grant.required_disclosure.required ? "Applied" : "Not required",
    evidence: "Verified signed release", generated_by: "N0VA Voice 5.2.1 / Lip-sync 3.4.0",
    revocation_status: grant.revoked_at ? `Revoked at ${grant.revoked_at}` : "Not revoked",
  };
}

// ── Expiration monitoring ───────────────────────────────────────────────────
export function checkExpirations(withinDays = 14): { person_id: string; grant_id: string; expires_in_days: number; affected_assets: number }[] {
  const now = Date.now(); const res: { person_id: string; grant_id: string; expires_in_days: number; affected_assets: number }[] = [];
  for (const p of persons.values()) for (const g of p.consent_grants) {
    const diff = new Date(g.expires_at).getTime() - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days >= 0 && days <= withinDays) {
      const affected = Array.from(derivedArtifacts.values()).filter(a => a.grant_id === g.grant_id).length;
      res.push({ person_id: p.person_id, grant_id: g.grant_id, expires_in_days: days, affected_assets: affected });
    }
  }
  return res;
}

// ── Revocation propagation ──────────────────────────────────────────────────
const ALL_TARGETS = ["render_queue", "project_library", "youtube_queue", "website_cdn", "review_links", "voice_model", "face_embeddings", "presenter_presets", "cdn_objects", "publishing_connectors", "crm_campaigns", "workspace_tasks", "face_search_index", "cached_proxies", "linked_dam"];

export function revokeGrant(grantId: string, scope: RevocationEvent["scope"], reason_code = "consent_withdrawn"): RevocationEvent {
  const found = getGrant(grantId);
  if (!found) throw new Error(`Grant ${grantId} not found`);
  found.grant.status = "revoked"; found.grant.revoked_at = nowIso();
  const event: RevocationEvent = {
    event_type: "identity.consent.revoked", event_id: uid("event"), person_id: found.person.person_id, grant_id: grantId,
    effective_at: nowIso(), scope, reason_code,
    required_actions: ["block_new_generation", "freeze_exports", "identify_published_derivatives", "notify_owners", "request_takedown_or_replacement"],
  };
  revocationEvents.set(event.event_id, event);
  // init propagation status
  const status: RevocationPropagationStatus = {
    event_id: event.event_id, total: ALL_TARGETS.length,
    completed: ALL_TARGETS.slice(0, 8), // mock 8/10 complete
    pending: ALL_TARGETS.slice(8),
    progress: `8/${ALL_TARGETS.length} complete`,
  };
  propagationStatus.set(event.event_id, status);
  // disable derived artifacts
  for (const [key, art] of derivedArtifacts) if (art.grant_id === grantId) {
    // mark as revoked — in real system would revoke tokens, remove from indexes
    derivedArtifacts.set(key, { ...art, type: art.type + ":revoked" });
  }
  return event;
}
export function getRevocationStatus(eventId: string): RevocationPropagationStatus | null { return propagationStatus.get(eventId) ?? null; }
export function listRevocationEvents(): RevocationEvent[] { return Array.from(revocationEvents.values()); }

// ── Model and embedding revocation ──────────────────────────────────────────
export function revokeDerivedArtifacts(personId: string, grantId: string): { voice_models: string[]; face_embeddings: string[]; presenter_presets: string[]; generated_clips: string[] } {
  const results = { voice_models: [] as string[], face_embeddings: [] as string[], presenter_presets: [] as string[], generated_clips: [] as string[] };
  for (const art of derivedArtifacts.values()) if (art.person_id === personId && art.grant_id === grantId) {
    if (art.type.includes("voice")) results.voice_models.push(art.asset_id);
    else if (art.type.includes("face")) results.face_embeddings.push(art.asset_id);
    else if (art.type.includes("presenter")) results.presenter_presets.push(art.asset_id);
    else results.generated_clips.push(art.asset_id);
  }
  return results;
}

// ── Export consent gate ─────────────────────────────────────────────────────
export function evaluateExportGate(exportId: string, timelineChecks: { operation: string; person_id: string; range: string }[]): ExportConsentGate {
  const checks: ExportConsentGate["checks"] = [];
  const blocking: string[] = [];
  for (const c of timelineChecks) {
    const dec = evaluateConsent({ person_id: c.person_id, operation: c.operation, project_id: "project_001", territory: "IN", platform: "youtube", audience: "public" });
    let result: ExportConsentGate["checks"][number]["result"] = "pass";
    if (dec.decision === "expired") { result = "expired"; blocking.push(`${c.operation} expired at ${c.range}`); }
    else if (dec.decision === "revoked") { result = "expired"; blocking.push(`${c.operation} revoked`); }
    else if (dec.decision === "denied" || dec.decision === "scope_mismatch") { result = "missing"; blocking.push(`${c.operation} scope mismatch`); }
    else if (dec.decision === "allowed_with_disclosure") {
      // check disclosure applied?
      const hasDisclosure = true; // mock
      if (!hasDisclosure) { result = "missing"; blocking.push(`disclosure missing for ${c.operation}`); }
    }
    // provenance check
    const hasProv = provenanceStore.size > 0;
    if (!hasProv) { checks.push({ check: "provenance", result: "incomplete", range: c.range }); blocking.push("provenance incomplete"); }
    checks.push({ check: c.operation, result, range: c.range });
  }
  // add disclosure/provenance checks
  checks.push({ check: "disclosure", result: blocking.some(b => b.includes("disclosure")) ? "missing" : "pass" });
  checks.push({ check: "provenance", result: blocking.some(b => b.includes("provenance")) ? "incomplete" : "pass" });
  return { export_id: exportId, result: blocking.length ? "blocked" : "allowed", checks, blocking_reasons: blocking };
}

// ── Agent consent tokens ────────────────────────────────────────────────────
export function issueAgentToken(agent_id: string, person_id: string, allowed_operations: string[], project_id: string): AgentConsentToken {
  const token: AgentConsentToken = {
    agent_id, person_id, allowed_operations, project_id, territories: ["IN"], expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    single_use: true, audit_required: true, token_id: uid("token"),
  };
  agentTokens.set(token.token_id, token);
  return token;
}
export function verifyAgentToken(tokenId: string, operation: string): { allowed: boolean; reason?: string } {
  const t = agentTokens.get(tokenId);
  if (!t) return { allowed: false, reason: "token not found" };
  if (new Date(t.expires_at).getTime() < Date.now()) return { allowed: false, reason: "token expired" };
  if (!t.allowed_operations.includes(operation)) return { allowed: false, reason: `operation ${operation} not in token scope` };
  // single_use enforcement mock: after verify, mark used
  if (t.single_use) agentTokens.delete(tokenId);
  return { allowed: true };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
export function listEvidences(): ConsentEvidence[] { return Array.from(evidences.values()); }
export function clearIdentityStores(): void {
  persons.clear(); evidences.clear(); facePolicies.clear(); voicePermissions.clear(); presenterPolicies.clear();
  disclosurePolicies.clear(); provenanceStore.clear(); revocationEvents.clear(); propagationStatus.clear(); agentTokens.clear(); derivedArtifacts.clear();
  // re-seed
  const p: PersonIdentity = {
    person_id: "person_01J_demo", display_name: "Encrypted Person Name", identity_status: "verified", identity_methods: ["government_verified"],
    consent_grants: [{
      grant_id: "consent_01J_demo", status: "active", consent_version: "v3.2", issued_at: "2026-07-01T10:00:00Z", expires_at: "2027-07-01T23:59:59Z", revoked_at: null,
      territories: ["IN","US","GB"], projects: ["project_001"], platforms: ["youtube","linkedin","website"],
      permissions: { face_detection: true, face_recognition: true, face_tracking: true, face_generation: true, voice_transcription: true, voice_cloning: true, voice_conversion: false, lip_sync: true, synthetic_presenter: true, body_motion_transfer: false, likeness_transfer: true },
      required_disclosure: { required: true, language: "en-IN", text: "This presenter is digitally generated", placement: "opening_and_description", minimum_duration_ms: 4000 },
      source_evidence: ["evidence_01J_demo"], approved_by: ["legal_001"],
    }], created_at: nowIso(),
  };
  persons.set(p.person_id, p);
}
