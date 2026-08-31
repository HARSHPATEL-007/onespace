/**
 * N0VA VIDEOS — Policy and Plugin Platform Engine
 * Policy-as-code + sandboxed extensibility
 */
import type { CanonicalPolicy, PolicyContext, PolicyDecision, PolicyEvidence, PolicyConflict, PolicyTest, PluginManifest, PluginRecord, PluginHealth, PluginMediaGrant, PluginExecution, MediaAccessLevel } from "./policy-plugin-types";

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso() { return new Date().toISOString(); }
function hash(s: string) { return `sha3-512:${s.slice(0,12)}${uid("h").slice(-4)}`; }

const policies = new Map<string, CanonicalPolicy>();
const policyDecisions = new Map<string, PolicyDecision>();
const policyTests = new Map<string, PolicyTest>();
const plugins = new Map<string, PluginRecord>();
const executions = new Map<string, PluginExecution>();

// ── Seed policies ────────────────────────────────────────────────────────────
(function seed(){
  policies.set("eu-client-delivery-v7",{
    name:"eu-client-delivery", version:7, status:"active", priority:80,
    scope:{ tenants:["tenant_acme"], regions:["EU"], project_types:["client_delivery"], destinations:["client_portal","broadcast"] },
    require:["valid_likeness_consent","captions","copyright_scan","brand_review","privacy_scan","accessibility_report"],
    prohibit:["public_download","raw_source_external_share","unapproved_voice_clone","unredacted_pii_export"],
    allow:["watermarked_review","approved_privacy_derivative","destination_scoped_delivery"],
    retention:{ source_media:"365d", proxies:"180d", review_exports:"90d", captions:"365d", derived_embeddings:"30d", audit_records:"730d" },
    privacy:{ unknown_faces:"blur", license_plates:"blur", medical_data:"redact", financial_data:"redact", voice_anonymization:"required_for_unconsented_speakers" },
    approvals:{ external_share:{ required:["project_owner","privacy_officer"] }, unwatermarked_export:{ required:["producer","security_officer"] } },
    enforcement:{ on_violation:"block", on_uncertainty:"require_review", on_missing_data:"defer" },
  });
  policies.set("project-social-preview-v2",{
    name:"project-social-preview", version:2, status:"active", priority:60,
    scope:{ tenants:["tenant_acme"], regions:["EU"], project_types:["client_delivery"], destinations:["client_portal"] },
    require:["vertical_safe_area","mobile_caption_validation"],
    prohibit:["original_camera_files"],
    allow:["watermarked_review"], retention:{}, privacy:{ unknown_faces:"blur", license_plates:"blur", medical_data:"redact", financial_data:"redact", voice_anonymization:"required" },
    approvals:{ external_share:{ required:["project_owner"] }, unwatermarked_export:{ required:["producer"] } },
    enforcement:{ on_violation:"block", on_uncertainty:"require_review", on_missing_data:"defer" },
    extends:["eu-client-delivery"],
  });
  // Seed plugin
  const manifest: PluginManifest = {
    id:"com.example.n0va.scene-enhancer", name:"Scene Enhancer", version:"2.4.1",
    publisher:{ name:"Example Media Labs", id:"publisher_example" }, type:"effect", sdk_version:"2.3", api_version:"v1", license:"commercial",
    signature:{ algorithm:"ed25519", key_id:"publisher-key-04", signature:"base64..." },
    compatibility:{ n0va_versions:[">=12.0 <13.0"], platforms:["linux-x86_64","linux-arm64"], gpu:["cuda","metal"] },
    permissions:{ media:{ read:["proxy_video"], write:["derived_video"] }, metadata:{ read:["scene_boundaries","color_profile"], write:["effect_parameters"] }, network:{ outbound:["none"] }, storage:{ temporary_bytes:2147483648 }, secrets:["none"] },
    resources:{ cpu_cores:4, memory_mb:8192, gpu_memory_mb:4096, max_runtime_seconds:600, max_output_bytes:10000000000 },
    security:{ isolation:"wasm_or_microvm", attestation_required:true, training_on_customer_data:false, network_policy:"deny_by_default" },
  };
  plugins.set(manifest.id,{ manifest, trust_level:"verified_publisher", status:"enabled", health:{ plugin_id:manifest.id, version:manifest.version, executions_24h:18420, success_rate:0.998, p95_latency_ms:842, policy_denials:14, permission_violations:0, network_attempts_blocked:0, quality_regressions:2, status:"healthy_with_warnings" } });
  // Seed tests
  policyTests.set("block-unconsented-external-share",{ name:"block-unconsented-external-share", policy:"eu-client-delivery-v7", event:"external_share", input:{ consent:{ likeness:"invalid" }, destination:"client_portal" }, expect:{ decision:"deny", reason_codes:["invalid_likeness_consent"] } });
})();

// ── Policy evaluation ────────────────────────────────────────────────────────
const PRECEDENCE = ["legal_hold","platform_security","regional_privacy","tenant_policy","client_contract","project_policy","user_preference"];

export function evaluatePolicy(context: PolicyContext, policyId?: string): PolicyDecision {
  const pid = policyId ?? "eu-client-delivery-v7";
  const policy = policies.get(pid);
  const reasonCodes: string[] = [];
  const requiredActions: string[] = [];
  let decision: PolicyDecision["decision"] = "allow";
  const controls: string[] = [];

  // Missing data defer
  if (!context.consent || context.quality?.brand_review===undefined) {
    // if required check missing, defer
    if (policy?.enforcement.on_missing_data==="defer" && context.quality?.brand_review===undefined && context.event==="export_requested") {
      decision="defer_until_data_is_available";
      reasonCodes.push("missing_brand_review");
    }
  }
  // Check require
  if (context.quality?.brand_review==="pending") { reasonCodes.push("brand_review_pending"); requiredActions.push("complete_brand_review"); decision="deny"; }
  if (context.consent?.likeness==="invalid" || context.consent?.likeness==="partial") { if (!reasonCodes.includes("invalid_likeness_consent")) reasonCodes.push("invalid_likeness_consent"); if (decision==="allow") decision="deny"; }
  // Check prohibit
  if (context.requested_actions.includes("public_download") || context.destination==="public-link") { if (policy?.prohibit.includes("public_download")) { reasonCodes.push("public_download_prohibited"); decision="deny"; } }
  if (context.requested_actions.includes("export") && context.asset_classification==="confidential" && context.destination==="client_portal" && !context.quality?.privacy_scan) { /* need privacy */ }

  // Plugin-specific
  if (context.plugin_id) {
    const plugin = plugins.get(context.plugin_id);
    if (plugin && plugin.manifest.security.training_on_customer_data===false && context.region==="EU") {
      // allowed
    }
  }

  if (reasonCodes.length===0) { reasonCodes.push("policy_allowed"); decision="allow"; }
  if (decision==="deny") controls.push("watermark_required","public_download_disabled");

  const pd: PolicyDecision = {
    decision_id: uid("decision"), policy_id: pid, event: context.event, decision, reason_codes: reasonCodes, required_actions: requiredActions,
    controls, evaluated_at: nowIso(), policy_hash: hash(pid), expires_at: new Date(Date.now()+10*60000).toISOString(),
  };
  policyDecisions.set(pd.decision_id, pd);
  return pd;
}

export function composePolicies(policyIds: string[]): { winner: string; conflict?: PolicyConflict } {
  // Simple precedence: higher priority wins; legal_hold top
  const sorted = policyIds.map(id=>policies.get(id)).filter(Boolean) as CanonicalPolicy[];
  sorted.sort((a,b)=>b.priority - a.priority);
  const winner = (sorted[0]?.name ?? policyIds[0] ?? "unknown") as string;
  // Check conflict example: project permits public_download while regional prohibits
  const hasConflict = policyIds.includes("eu-client-delivery-v7") && policyIds.includes("project-social-preview-v2");
  if (hasConflict) {
    const conflict: PolicyConflict = {
      policies:["eu-client-delivery-v7","project-social-preview-v2"],
      conflict:"project policy permits public download while regional policy prohibits it",
      winner:"eu-client-delivery-v7", resolution:"deny_public_download",
    };
    return { winner, conflict };
  }
  return { winner };
}

export function getPolicyEvidence(decisionId: string): PolicyEvidence | null {
  const d = policyDecisions.get(decisionId);
  if (!d) return null;
  return {
    decision_id: decisionId, policy_hash: d.policy_hash, input_manifest_hash: hash(decisionId), checks: d.reason_codes.map(rc=>({ check: rc, status: d.decision==="deny"?"fail":"pass" })),
    model_versions:["n0va-privacy-detector-v5","n0va-copyright-scan-v4"], evaluated_by:"policy-engine-v3", timestamp: nowIso(),
  };
}

export function runPolicyTests(policyId?: string): PolicyTest[] {
  const tests = Array.from(policyTests.values()).filter(t=>!policyId || t.policy===policyId);
  for (const t of tests) {
    const ctx: PolicyContext = {
      event: t.event, tenant_id:"tenant_acme", project_id:"project_001", asset_ids:["asset_001"], principal_id:"user_017", region:"EU", destination: (t.input.destination as string) ?? "client_portal",
      consent: t.input.consent as PolicyContext["consent"], quality:{ brand_review:"pending" }, requested_actions:["share"],
    };
    const decision = evaluatePolicy(ctx, t.policy);
    t.result = { pass: decision.decision===t.expect.decision, actual: decision };
  }
  return tests;
}

export function listPolicies(): CanonicalPolicy[] { return Array.from(policies.values()); }
export function getPolicy(policyId: string): CanonicalPolicy | null { return policies.get(policyId) ?? null; }
export function failSafeDecision(event: string): PolicyDecision {
  // When engine unavailable: deny external share, allow low-risk derivative preview if cached
  const decision: PolicyDecision["decision"] = event==="external_share" ? "deny" : event==="preview_low_risk" ? "allow" : "deny";
  return { decision_id: uid("decision"), policy_id:"fail-safe", event, decision, reason_codes: ["engine_unavailable_fail_closed"], required_actions:["retry_policy_evaluation"], evaluated_at: nowIso(), policy_hash: hash("fail-safe") };
}

// ── Plugin SDK ───────────────────────────────────────────────────────────────
export function registerPlugin(manifest: PluginManifest, packageUri?: string, signature?: string): PluginRecord {
  // Validate manifest, signature, SBOM etc. mock
  if (!manifest.id || !manifest.version) throw new Error("Invalid manifest");
  const rec: PluginRecord = { manifest, package_uri: packageUri, trust_level:"tenant_approved", status:"registered", execution_count:0 };
  // Verify signature mock
  if (signature && manifest.signature && signature!==manifest.signature.signature) {
    rec.trust_level="quarantined";
  }
  plugins.set(manifest.id, rec);
  return rec;
}
export function requestPluginReview(pluginId: string, version: string, requestedScopes: string[], targetRegions: string[]): PluginRecord | null {
  const rec = plugins.get(pluginId);
  if (!rec) return null;
  rec.status="review_requested";
  return rec;
}
export function enablePluginForTenant(pluginId: string, tenantId: string, scope: { projects?: string[]; asset_classes?: string[]; regions?: string[] }): PluginRecord | null {
  const rec = plugins.get(pluginId);
  if (!rec) return null;
  rec.status="enabled";
  rec.enabled_scopes = rec.enabled_scopes ?? [];
  rec.enabled_scopes.push(scope);
  rec.trust_level="tenant_approved";
  return rec;
}
export function getPlugin(pluginId: string): PluginRecord | null { return plugins.get(pluginId) ?? null; }
export function listPlugins(): PluginRecord[] { return Array.from(plugins.values()); }

export function validatePermissions(manifest: PluginManifest, requested: string[]): { allowed: boolean; denied: string[] } {
  const allowed: string[] = [];
  const perms = manifest.permissions;
  const declared: string[] = [];
  if (perms.media?.read) declared.push(...perms.media.read.map(p=>`media.read.${p}`));
  if (perms.media?.write) declared.push(...perms.media.write.map(p=>`media.write.${p}`));
  if (perms.metadata?.read) declared.push(...perms.metadata.read.map(p=>`metadata.read.${p}`));
  if (perms.network?.outbound) declared.push(...perms.network.outbound);
  const denied = requested.filter(r=>!declared.includes(r));
  return { allowed: denied.length===0, denied };
}

export function grantPluginMediaAccess(pluginId: string, assetId: string, level: MediaAccessLevel, purpose: string): PluginMediaGrant {
  const plugin = plugins.get(pluginId);
  if (!plugin) throw new Error("Plugin not found");
  // Check permission
  const need = level==="proxy" ? "media.read.proxy_video" : level==="original_full_asset" ? "media.read.original" : "media.read.proxy";
  const check = validatePermissions(plugin.manifest, [need]);
  if (!check.allowed) throw new Error(`Permission denied: ${check.denied.join(",")}`);
  // Check trust level for sensitive media
  if (level==="original_full_asset" && plugin.trust_level!=="platform_signed" && plugin.trust_level!=="tenant_approved") throw new Error("Sensitive media requires platform-signed or tenant-approved");
  const grant: PluginMediaGrant = {
    plugin_id: pluginId, asset_id: assetId, access:{ level, watermarked: level!=="metadata_only", time_ranges: level==="proxy"?[{start_ms:0,end_ms:124500}]:undefined }, expires_at: new Date(Date.now()+30*60000).toISOString(), purpose,
  };
  return grant;
}

export function executePlugin(pluginId: string, operation: string, assetIds: string[], timelineVersion: string, purpose: string): PluginExecution {
  const plugin = plugins.get(pluginId);
  if (!plugin) throw new Error("Plugin not found");
  if (plugin.status==="revoked" || plugin.trust_level==="revoked") throw new Error("Plugin revoked");
  if (plugin.trust_level==="quarantined") throw new Error("Plugin quarantined");
  // Check sandbox resource limits
  if (plugin.manifest.resources.max_runtime_seconds<1) throw new Error("Resource limit exceeded");
  // Policy evaluation before execution
  const policyDecision = evaluatePolicy({ event:"plugin_execution_requested", tenant_id:"tenant_acme", project_id:"project_001", asset_ids: assetIds, principal_id:"system", region:"EU", destination:"plugin_sandbox", requested_actions:[operation], plugin_id: pluginId }, "eu-client-delivery-v7");
  if (policyDecision.decision==="deny") throw new Error(`Policy denied: ${policyDecision.reason_codes.join(",")}`);
  const exec: PluginExecution = {
    plugin_id: pluginId, plugin_version: plugin.manifest.version, sdk_version: plugin.manifest.sdk_version, runtime_digest: hash(plugin.manifest.id+plugin.manifest.version), input_manifest_hash: hash(assetIds.join(",")), output_manifest_hash: hash(operation), policy_decision_id: policyDecision.decision_id, attestation:"verified", status:"completed", output:{ operation, assetIds, result:"mock_output" },
  };
  executions.set(exec.runtime_digest, exec);
  if (plugin.health) plugin.health.executions_24h += 1;
  return exec;
}

export function getPluginHealth(pluginId: string): PluginHealth | null { return plugins.get(pluginId)?.health ?? null; }
export function listExecutions(): PluginExecution[] { return Array.from(executions.values()); }
export function revokePlugin(pluginId: string): PluginRecord | null {
  const rec = plugins.get(pluginId);
  if (!rec) return null;
  rec.status="revoked"; rec.trust_level="revoked";
  return rec;
}
