/**
 * N0VA VIDEOS — Marketplace Engine (Trusted Composable Media Marketplace)
 * Catalog → Trust → Compatibility → License → Secure Install → Runtime Policy → Metering → Updates/Revoke/Audit
 * Every item addressable by n0va://marketplace/{type}/{slug}/{version}
 */
import type {
  MarketplaceItemRecord, MarketplaceItemType, MarketplaceItemStatus, MarketplaceAddress,
  MarketplaceEntitlement, MarketplaceInstallation, MarketplaceLockfile, MarketplaceLockEntry,
  Publisher, CertificationLevel, ProvenanceState, SecurityBadge, CompatibilityLevel, UpdateChannel,
  LicenseEnforcementMode, PreviewMode, LicenseValidationContext, LicenseValidationResult,
  SecurityScanResult, CompatibilityCheckResult, RightsManifest, ProvenanceManifestAttached,
  MarketplaceRevenueRecord, PublisherOnboarding, MarketplaceReview, MarketplaceAuditEvent,
  MarketplaceSearchQuery, MarketplaceSearchResult, UpdatePolicy, CategoryMetadata,
} from "./marketplace-types";

function uid(p:string){ return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso(){ return new Date().toISOString(); }

// ── Stores ───────────────────────────────────────────────────────────────────
const catalog = new Map<string, MarketplaceItemRecord>(); // item_id → record
const catalogBySlug = new Map<string, string>(); // slug → item_id
const publishers = new Map<string, Publisher>();
const entitlements = new Map<string, MarketplaceEntitlement>(); // entitlement_id →
const entitlementsByTenant = new Map<string, MarketplaceEntitlement[]>(); // tenant_id → list
const installations = new Map<string, MarketplaceInstallation>(); // installation_id →
const installationsByTenant = new Map<string, MarketplaceInstallation[]>();
const installationsByProject = new Map<string, MarketplaceInstallation[]>();
const lockfiles = new Map<string, MarketplaceLockfile>(); // project_id → lockfile
const reviews = new Map<string, MarketplaceReview[]>(); // item_id → reviews
const auditLog: MarketplaceAuditEvent[] = [];
const revenueLog: MarketplaceRevenueRecord[] = [];
const provenanceAttachments = new Map<string, ProvenanceManifestAttached>(); // project_id →
const updatePolicies = new Map<string, UpdatePolicy>(); // tenant_id → policy
const publisherOnboardings = new Map<string, PublisherOnboarding>();
const scanResults = new Map<string, SecurityScanResult>();
const versionHistory = new Map<string, MarketplaceItemRecord[]>(); // item_id → versions

function emitAudit(type:string, item_id:string, version:string, tenant_id:string, actor:string, extra: Partial<MarketplaceAuditEvent> = {}){
  const ev: MarketplaceAuditEvent = {
    event_id: uid("evt"), type, tenant_id, project_id: extra.project_id, asset_id: extra.asset_id,
    item_id, version, license_id: extra.license_id, publisher_id: extra.publisher_id,
    actor, correlation_id: extra.correlation_id, content_hash: extra.content_hash,
    policy_decision: extra.policy_decision, timestamp: nowIso(),
  };
  auditLog.push(ev);
  if(auditLog.length>5000) auditLog.splice(0,1000);
  return ev;
}

// ── URI + Address ────────────────────────────────────────────────────────────
export function buildUri(type:MarketplaceItemType, slug:string, version:string){ return `n0va://marketplace/${type}/${slug}/${version}`; }
export function parseUri(uri:string): MarketplaceAddress | null {
  const m = /^n0va:\/\/marketplace\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(uri);
  if(!m) return null;
  return { marketplace_item_id: `${m[2]!}`, publisher_id: "unknown", item_type: m[1] as MarketplaceItemType, product_slug: m[2]!, version: m[3]!, uri };
}
export function addressFor(item:MarketplaceItemRecord): MarketplaceAddress {
  return {
    marketplace_item_id: item.item_id,
    publisher_id: item.publisher.id,
    item_type: item.type,
    product_slug: item.slug,
    version: item.version,
    license_id: `lic_${item.item_id}_${item.version}`,
    content_hash: item.content.sha256,
    uri: buildUri(item.type, item.slug, item.version),
  };
}

// ── Publishers ───────────────────────────────────────────────────────────────
export function upsertPublisher(pub: Publisher){
  publishers.set(pub.id, pub);
  return pub;
}
export function getPublisher(id:string){ return publishers.get(id); }
export function onboardPublisher(pub: Publisher, attestation: Omit<PublisherOnboarding,"publisher_id"|"created_at"|"status">): PublisherOnboarding {
  publishers.set(pub.id, pub);
  const ob: PublisherOnboarding = { publisher_id: pub.id, created_at: nowIso(), status:"pending", ...attestation };
  publisherOnboardings.set(pub.id, ob);
  emitAudit("marketplace.publisher.onboarded", "publisher", "1.0.0", "system", pub.id, { publisher_id: pub.id });
  return ob;
}
export function verifyPublisher(publisher_id:string, certification: CertificationLevel){
  const pub = publishers.get(publisher_id);
  if(!pub) throw new Error("Publisher not found");
  pub.certification = certification;
  pub.verified = certification!=="community";
  const ob = publisherOnboardings.get(publisher_id);
  if(ob){ ob.status="verified"; ob.certification=certification; }
  emitAudit("marketplace.publisher.verified", "publisher", "1.0.0", "system", publisher_id, { publisher_id, policy_decision: certification });
  return pub;
}
export function listPublishers(){ return Array.from(publishers.values()); }

// ── Catalog ──────────────────────────────────────────────────────────────────
export function createItem(input: Omit<MarketplaceItemRecord,"item_id"|"created_at"|"updated_at"> & { item_id?:string }): MarketplaceItemRecord {
  const id = input.item_id ?? uid("item");
  const now = nowIso();
  const rec: MarketplaceItemRecord = {
    ...input,
    item_id: id,
    created_at: now,
    updated_at: now,
  } as MarketplaceItemRecord;
  rec.content.content_hash = rec.content.sha256;
  catalog.set(id, rec);
  catalogBySlug.set(rec.slug, id);
  const hist = versionHistory.get(id) ?? [];
  hist.push({ ...rec });
  versionHistory.set(id, hist);
  // initial security scan — respect seed's declared status, otherwise pending
  const initStatus = (rec.security.scan_status as unknown as string) === "passed" ? "passed" : "pending";
  const initBadge = (rec.security.badge as SecurityBadge) ?? (initStatus==="passed" ? "verified" : "review_required");
  scanResults.set(id, { item_id:id, scan_id: uid("scan"), status: initStatus as "passed"|"pending", badge: initBadge, vulnerabilities: rec.security.known_vulnerabilities? [] : [], last_scanned_at: rec.security.last_scanned_at ?? now, scanner_version: rec.security.scan_version ?? "scanner-4.2" });
  emitAudit("marketplace.item.published", id, rec.version, "system", rec.publisher.id, { publisher_id: rec.publisher.id, content_hash: rec.content.sha256 });
  return rec;
}
export function getItem(item_id:string){ return catalog.get(item_id) ?? null; }
export function getItemBySlug(slug:string){
  const id = catalogBySlug.get(slug);
  return id ? catalog.get(id) ?? null : null;
}
export function listItems(filter?: { type?: MarketplaceItemType; status?: MarketplaceItemStatus; publisher_id?:string }){
  let arr = Array.from(catalog.values());
  if(filter?.type) arr = arr.filter(i=> i.type===filter.type);
  if(filter?.status) arr = arr.filter(i=> i.status===filter.status);
  if(filter?.publisher_id) arr = arr.filter(i=> i.publisher.id===filter.publisher_id);
  return arr;
}
export function updateItem(item_id:string, patch: Partial<MarketplaceItemRecord>): MarketplaceItemRecord | null {
  const cur = catalog.get(item_id);
  if(!cur) return null;
  const next = { ...cur, ...patch, updated_at: nowIso() } as MarketplaceItemRecord;
  catalog.set(item_id, next);
  const hist = versionHistory.get(item_id) ?? [];
  hist.push({ ...next });
  versionHistory.set(item_id, hist);
  emitAudit("marketplace.item.updated", item_id, next.version, "system", next.publisher.id);
  return next;
}
export function publishItem(item_id:string){
  const it = catalog.get(item_id);
  if(!it) throw new Error("Item not found");
  // quality gate check
  const gate = qualityGate(item_id);
  if(!gate.passed) throw new Error(`Quality gate failed: ${gate.failures.join("; ")}`);
  it.status="published";
  it.updated_at=nowIso();
  emitAudit("marketplace.item.published", item_id, it.version, "system", it.publisher.id);
  return it;
}
export function listVersions(item_id:string){ return versionHistory.get(item_id) ?? []; }

// ── Quality Gate (Phase 1) ──────────────────────────────────────────────────
export function qualityGate(item_id:string): { passed:boolean; failures:string[]; checks: Record<string,boolean> }{
  const it = catalog.get(item_id);
  if(!it) return { passed:false, failures:["Item not found"], checks:{} };
  const checks: Record<string,boolean> = {};
  checks.identity_verification = !!it.publisher.verified;
  checks.license_validation = !!it.license.identifier && it.license.identifier!=="unknown";
  checks.provenance_declaration = !!it.provenance.source_declaration;
  checks.artifact_integrity = !!it.content.sha256 && it.content.sha256.startsWith("sha256:");
  checks.compatibility_tests = !!it.compatibility.n0va_min;
  const scan = scanResults.get(item_id);
  checks.security_scan = scan?.status==="passed";
  checks.rights_review = !!it.rights;
  checks.documentation_review = !!it.description && it.description.length>20;
  checks.commercial_classification = !!it.pricing.model;
  checks.sandbox_test = it.security.sandbox_required ? (scan?.badge!=="blocked") : true;
  checks.revocation_test = it.security.revocation_status!=="revoked";
  const failures = Object.entries(checks).filter(([,v])=> !v).map(([k])=> k);
  return { passed: failures.length===0, failures, checks };
}

// ── Trust & Provenance ───────────────────────────────────────────────────────
export function getProvenanceState(item_id:string): ProvenanceState {
  const it = catalog.get(item_id);
  if(!it) return "publisher_declared";
  return it.provenance.state ?? "publisher_declared";
}
export function setProvenanceState(item_id:string, state: ProvenanceState){
  const it = catalog.get(item_id);
  if(it){ it.provenance.state = state; it.updated_at=nowIso(); }
  return it ?? null;
}
export function getProvenanceChain(item_id:string){
  const it = catalog.get(item_id);
  return it?.provenance.chain ?? [];
}
export function attachProvenance(project_id:string, attachment: ProvenanceManifestAttached){
  provenanceAttachments.set(project_id, attachment);
  emitAudit("marketplace.provenance.attached", attachment.items_used[0]?.item_id ?? "provenance", attachment.items_used[0]?.version ?? "1.0.0", "system", "system", { project_id, content_hash: attachment.c2pa_manifest });
  return attachment;
}
export function getProvenance(project_id:string){ return provenanceAttachments.get(project_id) ?? null; }

// ── Security Scanning ────────────────────────────────────────────────────────
export function scanItem(item_id:string): SecurityScanResult {
  const it = catalog.get(item_id);
  if(!it) throw new Error("Item not found");
  // Simulate scan: check for risky patterns per type
  const vulns: SecurityScanResult["vulnerabilities"] = [];
  if(it.type==="agent_skill" || it.type==="motion_graphics"){
    const meta = it.category_metadata as { required_permissions?: string[]; network_access?:string; external_urls?: string[] } | undefined;
    if(meta?.external_urls?.length) vulns.push({ id:"EXT_URL", severity:"medium", title:"Undeclared external URL" });
    if(meta?.network_access && meta.network_access!=="deny_by_default") vulns.push({ id:"NET_PERM", severity:"high", title:"Network not deny-by-default" });
  }
  if(it.type==="ai_model" && !it.provenance.ai_bom) vulns.push({ id:"AI_BOM_MISSING", severity:"high", title:"AI BOM missing" });
  const hasCritical = vulns.some(v=> v.severity==="critical");
  const hasHigh = vulns.some(v=> v.severity==="high");
  const status = hasCritical? "failed" : hasHigh? "review_required" : "passed";
  const badge: SecurityBadge = hasCritical? "blocked" : hasHigh? "review_required" : vulns.length? "scanned":"verified";
  const res: SecurityScanResult = {
    item_id, scan_id: uid("scan"), status, badge, vulnerabilities: vulns as SecurityScanResult["vulnerabilities"],
    last_scanned_at: nowIso(), scanner_version:"scanner-4.2", blocked: hasCritical,
  };
  scanResults.set(item_id, res);
  // update item security
  it.security.scan_status = status==="passed"? "passed": status==="failed"? "failed":"pending";
  it.security.badge = badge;
  it.security.known_vulnerabilities = vulns.length;
  it.security.last_scanned_at = res.last_scanned_at;
  it.security.scan_version = res.scanner_version;
  if(hasCritical){
    it.status="blocked";
    emitAudit("marketplace.security.issue.detected", item_id, it.version, "system", "scanner", { policy_decision:"blocked" });
  } else {
    emitAudit("marketplace.security.scan.completed", item_id, it.version, "system", "scanner", { policy_decision: status });
  }
  return res;
}
export function getScanResult(item_id:string){ return scanResults.get(item_id) ?? null; }

// ── Compatibility ────────────────────────────────────────────────────────────
export function validateCompatibility(item_id:string, n0va_version:string = "5.0.0"): CompatibilityCheckResult {
  const it = catalog.get(item_id);
  if(!it) throw new Error("Item not found");
  const issues: string[]=[];
  let level: CompatibilityLevel = "compatible";
  // N0VA version check
  if(it.compatibility.n0va_min && compareSemver(n0va_version, it.compatibility.n0va_min) < 0){
    issues.push(`Requires N0VA >= ${it.compatibility.n0va_min}, have ${n0va_version}`);
    level="unsupported";
  }
  if(it.compatibility.n0va_max && it.compatibility.n0va_max!=="5.x" && compareSemver(n0va_version, it.compatibility.n0va_max) > 0){
    issues.push(`Tested max ${it.compatibility.n0va_max}, have ${n0va_version} — compatible with warning`);
    if(level==="compatible") level="compatible_with_warning";
  }
  // GPU check
  if(it.compatibility.gpu_required) issues.push("GPU required");
  // Dependency check
  const missingDeps = (it.compatibility.required_dependencies ?? []).filter(dep=> !catalog.has(dep));
  if(missingDeps.length){
    issues.push(`Missing dependencies: ${missingDeps.join(", ")}`);
    level="requires_migration";
  }
  // Security blocked
  const scan = scanResults.get(item_id);
  if(scan?.blocked){ issues.push("Blocked due to critical security issue"); level="blocked"; }
  if(it.status==="blocked" || it.status==="revoked"){ level="blocked"; issues.push(`Item status ${it.status}`); }
  const result: CompatibilityCheckResult = { item_id, level, n0va_version, issues, requires_migration: level==="requires_migration", dependency_conflicts: missingDeps };
  if(level==="blocked" || level==="unsupported"){
    emitAudit("marketplace.compatibility.failed", item_id, it.version, "system", "system", { policy_decision: level });
  }
  return result;
}
function compareSemver(a:string, b:string){
  const pa=a.split(".").map(Number), pb=b.split(".").map(Number);
  for(let i=0;i<3;i++){ const av=pa[i]??0, bv=pb[i]??0; if(av!==bv) return av-bv; }
  return 0;
}
export function resolveDependencies(item_ids:string[]): { resolved:string[]; conflicts:string[]; missing:string[] }{
  const resolved=new Set<string>();
  const conflicts: string[]=[];
  const missing: string[]=[];
  const visit = (id:string, stack:Set<string>)=>{
    if(stack.has(id)){ conflicts.push(`Cycle: ${[...stack, id].join(" → ")}`); return; }
    if(resolved.has(id)) return;
    const it=catalog.get(id);
    if(!it){ missing.push(id); return; }
    stack.add(id);
    for(const dep of it.compatibility.required_dependencies ?? []){
      if(catalog.has(dep)) visit(dep, stack);
      else missing.push(dep);
    }
    stack.delete(id);
    resolved.add(id);
  };
  for(const id of item_ids) visit(id, new Set());
  return { resolved:Array.from(resolved), conflicts, missing };
}

// ── Licensing & Entitlement ─────────────────────────────────────────────────
export function purchaseLicense(item_id:string, tenant_id:string, opts: { project_id?:string; user_id?:string; seats?:number; order_id?:string }): MarketplaceEntitlement {
  const it = catalog.get(item_id);
  if(!it) throw new Error("Item not found");
  // Check publisher not revoked, security not blocked
  if(it.status==="revoked" || it.status==="blocked") throw new Error(`Cannot purchase — item ${it.status}`);
  const scan = scanResults.get(item_id);
  if(scan?.blocked) throw new Error("Blocked due to critical vulnerability");
  // Create entitlement
  const ent: MarketplaceEntitlement = {
    entitlement_id: uid("ent"), item_id, version: it.version, tenant_id,
    project_id: opts.project_id, user_id: opts.user_id,
    license_id: `lic_${item_id}_${Date.now().toString(36)}`,
    purchased_at: nowIso(),
    expires_at: it.license.term==="perpetual"? undefined : new Date(Date.now()+365*24*60*60*1000).toISOString(),
    seats: opts.seats ?? it.license.seats,
    projects_used: 0,
    status:"active",
    enforcement_mode:"allow",
    order_id: opts.order_id ?? uid("order"),
    receipt_url: `n0va://receipts/${uid("rcpt")}`,
  };
  entitlements.set(ent.entitlement_id, ent);
  const arr = entitlementsByTenant.get(tenant_id) ?? [];
  arr.push(ent);
  entitlementsByTenant.set(tenant_id, arr);
  // Revenue
  const gross = Math.round(it.pricing.price*100);
  const commission = Math.round(gross*0.2);
  revenueLog.push({
    tenant_id, item_id, gross_cents:gross, publisher_payout_cents: gross-commission, n0va_commission_cents:commission,
    refunds_cents:0, tax_cents: Math.round(gross*0.08), currency: it.pricing.currency, period: new Date().toISOString().slice(0,7),
  });
  emitAudit("marketplace.license.purchased", item_id, it.version, tenant_id, opts.user_id ?? tenant_id, { license_id: ent.license_id, publisher_id: it.publisher.id });
  return ent;
}
export function getEntitlement(entitlement_id:string){ return entitlements.get(entitlement_id) ?? null; }
export function listEntitlements(tenant_id:string){ return entitlementsByTenant.get(tenant_id) ?? []; }
export function validateLicense(item_id:string, ctx: LicenseValidationContext): LicenseValidationResult {
  const it = catalog.get(item_id);
  if(!it) return { item_id, valid:false, decision:"block", reason:"Item not found" };
  // Find entitlement for tenant
  const ents = entitlementsByTenant.get(ctx.tenant_id) ?? [];
  const ent = ents.find(e=> e.item_id===item_id && e.status==="active");
  if(!ent){
    return { item_id, valid:false, decision:"block", reason:"No active entitlement — purchase required" };
  }
  if(ent.expires_at && new Date(ent.expires_at).getTime() < Date.now()){
    ent.status="expired";
    return { item_id, valid:false, decision:"block", reason:"License expired", quarantine:true };
  }
  // Territory check
  if(ctx.territory && it.license.territories && !it.license.territories.includes("worldwide") && !it.license.territories.includes(ctx.territory)){
    return { item_id, valid:false, decision:"block", reason:`Territory ${ctx.territory} not covered` };
  }
  // Commercial check
  if(ctx.commercial && !it.license.commercial_use){
    return { item_id, valid:false, decision:"block", reason:"Commercial use not permitted" };
  }
  if(ctx.destination && it.rights.paid_advertising===false && ctx.destination.includes("ads")){
    return { item_id, valid:false, decision:"block", reason:"Paid advertising not permitted" };
  }
  // Seats/projects limit
  if(it.license.per_seat && ctx.seats && ent.seats && ctx.seats > ent.seats){
    return { item_id, valid:false, decision:"require_approval", reason:`Seats ${ctx.seats} exceeds licensed ${ent.seats}` };
  }
  // Revocation check
  if(it.status==="revoked") return { item_id, valid:false, decision:"block", reason:"Revoked — malware/license fraud" };
  // Rights matrix flag: if item has broadcast false and destination is broadcast
  if(ctx.destination==="broadcast" && it.rights.broadcast===false){
    return { item_id, valid:false, decision:"block", reason:"Broadcast not permitted" };
  }
  // All good — emit validation success
  emitAudit("marketplace.license.validated", item_id, it.version, ctx.tenant_id, ctx.user_id ?? ctx.tenant_id, { license_id: ent.license_id, policy_decision:"allow" });
  return { item_id, valid:true, decision:"allow" };
}
export function generateRightsManifest(item_id:string, asset_id?:string): RightsManifest {
  const it = catalog.get(item_id);
  if(!it) throw new Error("Item not found");
  const manifest: RightsManifest = {
    asset_id: asset_id ?? it.item_id,
    track_title: it.title,
    publisher_id: it.publisher.id,
    license_id: `lic_${item_id}`,
    rights: it.rights,
    territories: it.license.territories,
    term: it.license.term,
    attribution_required: it.license.attribution_required,
    proof_url: `n0va://rights/lic_${item_id}`,
    generated_at: nowIso(),
  };
  emitAudit("marketplace.rights.manifest.generated", item_id, it.version, "system", "system");
  return manifest;
}
export function getLicenseEvidence(item_id:string, tenant_id:string){
  const ent = (entitlementsByTenant.get(tenant_id) ?? []).find(e=> e.item_id===item_id);
  const it = catalog.get(item_id);
  if(!it || !ent) return null;
  return {
    license_agreement: `License ${ent.license_id} — ${it.license.identifier}`,
    receipt: ent.receipt_url,
    order_id: ent.order_id,
    publisher_signature: `sig_${it.publisher.id}_${it.content.sha256.slice(0,12)}`,
    effective_date: ent.purchased_at,
    expiration_date: ent.expires_at,
    rights_scope: it.rights,
    provenance_manifest: it.provenance.signed_manifest,
    dependency_manifest: it.compatibility.required_dependencies,
    security_report: scanResults.get(item_id),
    usage_history: getAuditForItem(item_id, tenant_id),
  };
}

// ── Secure Installation ──────────────────────────────────────────────────────
export function installItem(item_id:string, tenant_id:string, opts: { project_id?:string; user_id:string; n0va_version?:string }): MarketplaceInstallation {
  const it = catalog.get(item_id);
  if(!it) throw new Error("Item not found");
  // 1. Entitlement check
  const lic = validateLicense(item_id, { tenant_id, project_id: opts.project_id, user_id: opts.user_id });
  if(!lic.valid && lic.decision==="block") throw new Error(`License validation failed: ${lic.reason}`);
  if(lic.decision==="require_approval") throw new Error(`Requires approval: ${lic.reason}`);
  // 2. Compatibility
  const compat = validateCompatibility(item_id, opts.n0va_version ?? "5.0.0");
  if(compat.level==="blocked" || compat.level==="unsupported") throw new Error(`Compatibility ${compat.level}: ${compat.issues.join("; ")}`);
  // 3. Security
  const scan = scanResults.get(item_id);
  if(scan?.blocked) throw new Error("Security blocked — critical vulnerability");
  if(it.security.badge==="blocked") throw new Error("Item blocked");
  // 4. Dependency resolution
  const deps = resolveDependencies([item_id]);
  if(deps.conflicts.length) throw new Error(`Dependency conflict: ${deps.conflicts.join("; ")}`);
  if(deps.missing.length) throw new Error(`Missing dependencies: ${deps.missing.join(", ")}`);

  // Create installation — sandboxed if required
  const sandbox = !!it.security.sandbox_required || it.type==="agent_skill" || it.type==="motion_graphics";
  const inst: MarketplaceInstallation = {
    installation_id: uid("inst"),
    item_id, version: it.version, tenant_id,
    project_id: opts.project_id,
    installed_by: opts.user_id,
    installed_at: nowIso(),
    status:"installed",
    sandbox,
    lockfile_entry: { item_id, slug: it.slug, type: it.type, version: it.version, content_hash: it.content.sha256, installed_at: nowIso() },
    provenance_attached: false,
  };
  installations.set(inst.installation_id, inst);
  const arrT = installationsByTenant.get(tenant_id) ?? [];
  arrT.push(inst);
  installationsByTenant.set(tenant_id, arrT);
  if(opts.project_id){
    const arrP = installationsByProject.get(opts.project_id) ?? [];
    arrP.push(inst);
    installationsByProject.set(opts.project_id, arrP);
    // Update lockfile
    const lf = lockfiles.get(opts.project_id) ?? { project_id: opts.project_id, marketplace_lock:{}, entries:[], pinned_at: nowIso(), updated_at: nowIso() };
    lf.marketplace_lock[it.type] = it.version;
    lf.entries = lf.entries.filter(e=> e.item_id!==item_id);
    lf.entries.push(inst.lockfile_entry!);
    lf.updated_at = nowIso();
    lockfiles.set(opts.project_id, lf);
    // Attach provenance
    const existingProv = provenanceAttachments.get(opts.project_id);
    const prov: ProvenanceManifestAttached = existingProv ?? { project_id: opts.project_id, items_used:[], generated_at: nowIso() };
    prov.items_used.push({ item_id, version: it.version, license_id: entitlementsByTenant.get(tenant_id)?.find(e=> e.item_id===item_id)?.license_id ?? `lic_${item_id}` });
    prov.generated_at = nowIso();
    provenanceAttachments.set(opts.project_id, prov);
  }
  // Increment entitlement usage
  const ent = (entitlementsByTenant.get(tenant_id) ?? []).find(e=> e.item_id===item_id);
  if(ent) ent.projects_used = (ent.projects_used ?? 0) + 1;

  emitAudit("marketplace.item.installed", item_id, it.version, tenant_id, opts.user_id, { project_id: opts.project_id, publisher_id: it.publisher.id, content_hash: it.content.sha256 });
  return inst;
}
export function uninstallItem(installation_id:string, actor:string){
  const inst = installations.get(installation_id);
  if(!inst) throw new Error("Installation not found");
  inst.status="uninstalled";
  emitAudit("marketplace.item.uninstalled", inst.item_id, inst.version, inst.tenant_id, actor, { project_id: inst.project_id });
  return inst;
}
export function listInstallations(filter?: { tenant_id?:string; project_id?:string }){
  if(filter?.project_id) return installationsByProject.get(filter.project_id) ?? [];
  if(filter?.tenant_id) return installationsByTenant.get(filter.tenant_id) ?? [];
  return Array.from(installations.values());
}
export function getLockfile(project_id:string){ return lockfiles.get(project_id) ?? null; }
export function setLockfile(project_id:string, lock: MarketplaceLockfile){
  lockfiles.set(project_id, lock);
  emitAudit("marketplace.lock.updated", "lockfile", "1.0.0", "system", "system", { project_id });
  return lock;
}

// ── Version / Update Service ─────────────────────────────────────────────────
export function getUpdatePolicy(tenant_id:string): UpdatePolicy {
  return updatePolicies.get(tenant_id) ?? { tenant_id, channel:"stable", auto_update_patches:true, approve_minor:true, pin_major:true, require_security_review:false, block_publisher_updates:false };
}
export function setUpdatePolicy(policy: UpdatePolicy){
  updatePolicies.set(policy.tenant_id, policy);
  return policy;
}
export function checkForUpdates(item_id:string, current_version:string, channel: UpdateChannel = "stable"): { available?: MarketplaceItemRecord; requires_migration?:boolean }{
  const versions = versionHistory.get(item_id) ?? [];
  const latest = versions[versions.length-1];
  if(!latest || latest.version===current_version) return {};
  // Simple channel logic: only stable updates
  if(channel==="stable" && latest.status!=="published") return {};
  const requires_migration = compareSemver(latest.version.split(".")[0] ?? "0", current_version.split(".")[0] ?? "0")>0;
  return { available: latest, requires_migration };
}

// ── Revocation ───────────────────────────────────────────────────────────────
export type RevocationTrigger = "malware" | "license_fraud" | "publisher_request" | "rights_dispute" | "model_safety" | "expired_certificate" | "incompatible_update" | "regulatory";
export function revokeItem(item_id:string, trigger: RevocationTrigger, reason:string, actor:string){
  const it = catalog.get(item_id);
  if(!it) throw new Error("Item not found");
  it.status="revoked";
  it.security.revocation_status="revoked";
  it.security.revoke_reason = reason;
  it.security.revoked_at = nowIso();
  // Update entitlements: quarantine, not silent invalidation
  for(const ent of Array.from(entitlements.values()).filter(e=> e.item_id===item_id)){
    ent.status="revoked";
  }
  // Find affected projects
  const affected = Array.from(installations.values()).filter(i=> i.item_id===item_id && i.status==="installed");
  for(const inst of affected){
    inst.status="revoked";
  }
  emitAudit("marketplace.license.revoked", item_id, it.version, "system", actor, { policy_decision: trigger });
  // Notify would go via billing events etc.
  return { item: it, affected_projects: affected.map(a=> a.project_id).filter(Boolean) as string[], trigger, reason };
}
export function listAffectedProjects(item_id:string){
  return Array.from(installations.values()).filter(i=> i.item_id===item_id).map(i=> ({ installation: i, project_id: i.project_id, tenant_id: i.tenant_id }));
}

// ── Revenue / Purchase ───────────────────────────────────────────────────────
export function listRevenue(tenant_id?:string){
  if(!tenant_id) return revenueLog;
  return revenueLog.filter(r=> r.tenant_id===tenant_id);
}
export function getRevenueSummary(tenant_id:string){
  const rows = listRevenue(tenant_id);
  return {
    gross: rows.reduce((s,r)=> s+r.gross_cents,0),
    payout: rows.reduce((s,r)=> s+r.publisher_payout_cents,0),
    commission: rows.reduce((s,r)=> s+r.n0va_commission_cents,0),
    refunds: rows.reduce((s,r)=> s+r.refunds_cents,0),
    tax: rows.reduce((s,r)=> s+r.tax_cents,0),
    count: rows.length,
  };
}

// ── Reviews ──────────────────────────────────────────────────────────────────
export function addReview(item_id:string, tenant_id:string, user_id:string, ratings: MarketplaceReview["ratings"], comment?:string){
  const r: MarketplaceReview = { review_id: uid("rev"), item_id, tenant_id, user_id, ratings, comment, created_at: nowIso() };
  const arr = reviews.get(item_id) ?? [];
  arr.push(r);
  reviews.set(item_id, arr);
  return r;
}
export function listReviews(item_id:string){ return reviews.get(item_id) ?? []; }
export function getAverageRatings(item_id:string){
  const arr = reviews.get(item_id) ?? [];
  if(!arr.length) return null;
  const keys = ["creative_quality","technical_reliability","compatibility","documentation","support","license_clarity","performance","security"] as const;
  const avg: Record<string, number> = {};
  for(const k of keys){
    const vals = arr.map(r=> r.ratings[k]).filter(v=> typeof v==="number") as number[];
    avg[k] = vals.length? vals.reduce((s,v)=>s+v,0)/vals.length : 0;
  }
  return avg;
}

// ── Search / Discovery ───────────────────────────────────────────────────────
export function searchCatalog(query: MarketplaceSearchQuery): MarketplaceSearchResult {
  let items = Array.from(catalog.values()).filter(i=> i.status==="published");
  if(query.q){
    const q=query.q.toLowerCase();
    items = items.filter(i=> (`${i.title} ${i.description} ${i.slug}`).toLowerCase().includes(q));
  }
  if(query.category) items = items.filter(i=> i.type===query.category);
  if(query.license_type) items = items.filter(i=> i.license.type===query.license_type);
  if(query.commercial_use!==undefined) items = items.filter(i=> !!i.license.commercial_use===query.commercial_use);
  if(query.paid_advertising!==undefined) items = items.filter(i=> !!i.rights.paid_advertising===query.paid_advertising);
  if(query.territory) items = items.filter(i=> !i.license.territories || i.license.territories.includes(query.territory!));
  if(query.price_min!==undefined) items = items.filter(i=> i.pricing.price >= query.price_min!);
  if(query.price_max!==undefined) items = items.filter(i=> i.pricing.price <= query.price_max!);
  if(query.security_status) items = items.filter(i=> i.security.badge===query.security_status);
  if(query.publisher_verified!==undefined) items = items.filter(i=> i.publisher.verified===query.publisher_verified);
  if(query.ai_generated!==undefined){
    items = items.filter(i=> (i.provenance.source_declaration?.includes("AI") ?? false)===query.ai_generated);
  }
  if(query.compatibility){
    items = items.filter(i=> {
      const comp = validateCompatibility(i.item_id, query.compatibility!);
      return comp.level==="compatible" || comp.level==="compatible_with_warning";
    });
  }
  const total = items.length;
  const limit = query.limit ?? 20;
  items = items.slice(0, limit);
  // Facets
  const facets: MarketplaceSearchResult["facets"] = {
    category: Object.entries(countBy(items, i=> i.type)).map(([value,count])=>({value,count})),
    security: Object.entries(countBy(items, i=> i.security.badge ?? "review_required")).map(([value,count])=>({value,count})),
  };
  return { items, total, facets };
}
function countBy<T>(arr:T[], key:(t:T)=>string){
  const m: Record<string,number>={};
  for(const v of arr){ const k=key(v); m[k]=(m[k]??0)+1; }
  return m;
}

// ── Audit ────────────────────────────────────────────────────────────────────
export function getAuditForItem(item_id:string, tenant_id?:string){
  return auditLog.filter(e=> e.item_id===item_id && (!tenant_id || e.tenant_id===tenant_id));
}
export function listAudit(limit=50, tenant_id?:string){
  const filtered = tenant_id? auditLog.filter(e=> e.tenant_id===tenant_id): auditLog;
  return filtered.slice(-limit).reverse();
}
export function getAuditForProject(project_id:string){
  return auditLog.filter(e=> e.project_id===project_id);
}

// ── Rights enforcement at export time ───────────────────────────────────────
export function validateRightsForExport(project_id:string, destination?:string, territory?:string): { valid:boolean; failures:{ item_id:string; reason:string }[] }{
  const lock = lockfiles.get(project_id);
  if(!lock) return { valid:true, failures:[] };
  const failures: { item_id:string; reason:string }[]=[];
  for(const entry of lock.entries){
    const res = validateLicense(entry.item_id, { tenant_id: "tenant_acme", project_id, territory, destination, commercial:true });
    if(!res.valid) failures.push({ item_id: entry.item_id, reason: res.reason ?? "License invalid" });
  }
  return { valid: failures.length===0, failures };
}

// ── Usage metering hook (connect to billing for usage-based licenses) ───────
export function recordMarketplaceUsage(item_id:string, tenant_id:string, meter:string, quantity:number, idempotency_suffix?:string){
  // For AI models / voice packs: inference minutes etc. — delegate to billing engine via dynamic import to avoid cycle
  // Here we just audit and return; actual billing record done by caller via billing-engine
  emitAudit("marketplace.asset.used", item_id, catalog.get(item_id)?.version ?? "1.0.0", tenant_id, tenant_id, { policy_decision: meter });
  return { item_id, tenant_id, meter, quantity, idempotency_suffix };
}

// ── Preview without accidental commercial use ───────────────────────────────
export function getPreview(item_id:string, mode: PreviewMode = "watermarked_preview"){
  const it = catalog.get(item_id);
  if(!it) throw new Error("Item not found");
  // Preview always watermarked/low-res etc. never commercially usable without license
  return { item_id, mode, preview_uri: `${it.content.artifact_uri}?preview=${mode}`, watermarked:true, commercial_usable:false };
}

// ── Seed catalog (trusted assets Phase 1) ──────────────────────────────────
export function seedCatalog(){
  if(catalog.size) return Array.from(catalog.values());
  const pub1: Publisher = { id:"publisher_014", name:"Example Studio", verified:true, certification:"n0va_certified" };
  const pub2: Publisher = { id:"publisher_022", name:"Cinematic Tools", verified:true, certification:"n0va_compatible" };
  const pub3: Publisher = { id:"publisher_033", name:"Community Creator", verified:false, certification:"community" };
  upsertPublisher(pub1); upsertPublisher(pub2); upsertPublisher(pub3);
  const items: Omit<MarketplaceItemRecord,"item_id"|"created_at"|"updated_at">[] = [
    {
      slug:"cinematic-warm-lut", type:"lut", publisher:pub1, version:"3.2.1", status:"published", title:"Cinematic Warm LUT", description:"Warm film emulation with skin-tone protection, ACES compatible. Includes color-space tests, banding detection, HDR clipping tests.",
      content:{ artifact_uri:"n0va://artifacts/cinematic-warm-lut/3.2.1", sha256:"sha256:abc123warm", size_bytes:183442 },
      compatibility:{ n0va_min:"4.0.0", n0va_max:"5.x", platforms:["web","desktop","render-farm"], gpu_required:false, formats:["cube"] },
      license:{ type:"commercial", identifier:"custom-commercial-v2", commercial_use:true, redistribution:false, resale:false, territories:["worldwide"], term:"perpetual", attribution_required:false },
      provenance:{ creator:"Example Studio", source_declaration:"publisher-attested", created_at:"2026-08-01T00:00:00Z", signed_manifest:"n0va://manifests/cinematic-warm-lut", c2pa_manifest:"n0va://c2pa/cinematic-warm-lut", state:"n0va_certified" },
      security:{ scan_status:"passed", scan_version:"scanner-4.2", last_scanned_at: nowIso(), known_vulnerabilities:0, sandbox_required:false, badge:"verified" },
      rights:{ commercial_video:true, paid_advertising:true, broadcast:true, training:false, ai_generation:false },
      pricing:{ model:"one_time", price:49, currency:"USD" },
      category_metadata:{ kind:"lut", lut_format:"cube", input_color_space:"Log", output_color_space:"Rec.709", aces_compatible:true } as CategoryMetadata,
    },
    {
      slug:"youtube-starter-pack", type:"template", publisher:pub1, version:"2.0.0", status:"published", title:"YouTube Starter Pack", description:"Timeline + social formats + YouTube package with brand-kit slots, caption support, 4K/1080p, estimated render $0.30.",
      content:{ artifact_uri:"n0va://artifacts/youtube-starter-pack/2.0.0", sha256:"sha256:youtube2", size_bytes:5000000 },
      compatibility:{ n0va_min:"4.0.0", platforms:["web","desktop"], formats:["n0va-template"] },
      license:{ type:"commercial", identifier:"custom-commercial-v2", commercial_use:true, territories:["worldwide"], term:"perpetual" },
      provenance:{ creator:"Example Studio", source_declaration:"publisher-attested", state:"n0va_certified", signed_manifest:"n0va://manifests/youtube-starter-pack" },
      security:{ scan_status:"passed", scan_version:"scanner-4.2", last_scanned_at: nowIso(), known_vulnerabilities:0, badge:"verified" },
      rights:{ commercial_video:true, paid_advertising:true, broadcast:true },
      pricing:{ model:"one_time", price:79, currency:"USD" },
      category_metadata:{ kind:"template", supported_resolutions:["1080p","4K"], supported_frame_rates:["30","60"], brand_kit_slots:["logo","colors"], estimated_render_cost_cents:30 } as CategoryMetadata,
    },
    {
      slug:"lower-thirds-pro", type:"motion_graphics", publisher:pub2, version:"5.1.0", status:"published", title:"Lower Thirds Pro", description:"Broadcast lower thirds with restricted runtime — no filesystem, no credential access, deny_by_default network.",
      content:{ artifact_uri:"n0va://artifacts/lower-thirds-pro/5.1.0", sha256:"sha256:lowerthirds", size_bytes:1200000 },
      compatibility:{ n0va_min:"4.0.0", platforms:["web","desktop","render-farm"], required_dependencies:[] },
      license:{ type:"commercial", identifier:"custom-commercial-v2", commercial_use:true, territories:["worldwide"], term:"perpetual" },
      provenance:{ creator:"Cinematic Tools", source_declaration:"publisher-attested", state:"n0va_certified" },
      security:{ scan_status:"passed", scan_version:"scanner-4.2", last_scanned_at: nowIso(), known_vulnerabilities:0, sandbox_required:true, network_permissions:{ mode:"deny_by_default", allowed_domains:[] }, badge:"verified" },
      rights:{ commercial_video:true, paid_advertising:true },
      pricing:{ model:"one_time", price:99, currency:"USD" },
      category_metadata:{ kind:"motion_graphics", required_fonts:["Acme Sans"], sandbox:{ filesystem:false, network:false, credential:false, cross_tenant:false } } as CategoryMetadata,
    },
    {
      slug:"epic-score-001", type:"music", publisher:pub1, version:"1.0.0", status:"published", title:"Epic Score — Rights Cleared", description:"Royalty-free, sync+master+performance rights, worldwide perpetual, paid ads & broadcast allowed.",
      content:{ artifact_uri:"n0va://artifacts/epic-score-001/1.0.0", sha256:"sha256:epic", size_bytes:45000000 },
      compatibility:{ n0va_min:"4.0.0", platforms:["web","desktop","render-farm"] },
      license:{ type:"commercial", identifier:"CC-BY-4.0", commercial_use:true, territories:["worldwide"], term:"perpetual" },
      provenance:{ creator:"Example Studio", source_declaration:"publisher-attested", state:"n0va_certified" },
      security:{ scan_status:"passed", scan_version:"scanner-4.2", last_scanned_at: nowIso(), known_vulnerabilities:0, badge:"verified" },
      rights:{ commercial_video:true, paid_advertising:true, broadcast:true, training:false },
      pricing:{ model:"one_time", price:29, currency:"USD" },
      category_metadata:{ kind:"music", rights_type:"royalty_free", sync_rights:true, master_rights:true, territories:["worldwide"], paid_ads:true, broadcast:true } as CategoryMetadata,
    },
    {
      slug:"caption-pro", type:"ai_model", publisher:pub1, version:"5.0.0", status:"published", title:"N0VA Caption Pro 5.0", description:"Caption model WER 0.041, 42 languages, safety report, latency 200ms. AI BOM included.",
      content:{ artifact_uri:"n0va://artifacts/caption-pro/5.0.0", sha256:"sha256:caption5", size_bytes:2500000000 },
      compatibility:{ n0va_min:"4.0.0", platforms:["render-farm"], gpu_required:true },
      license:{ type:"commercial", identifier:"proprietary-commercial", commercial_use:true, territories:["worldwide"], term:"perpetual" },
      provenance:{ creator:"Example Studio", source_declaration:"publisher-attested", state:"independently_audited", weights_sha256:"sha256:weightsCaption5", ai_bom:{ model_id:"n0va-caption-pro", version:"5.0.0", weights_sha256:"sha256:weightsCaption5", base_models:["base-whisper"], datasets:[{ name:"dataset-name", provenance:"publisher declaration", license:"license-identifier" }], evaluation:{ wer:0.041, languages:42, safety_report:"n0va://reports/safety-500" }, rights:{ commercial_inference:true, fine_tuning:false, model_redistribution:false } } },
      security:{ scan_status:"passed", scan_version:"scanner-4.2", last_scanned_at: nowIso(), known_vulnerabilities:0, badge:"verified" },
      rights:{ commercial_video:true, training:false, ai_generation:false },
      pricing:{ model:"usage_based", price:0, currency:"USD", usage_included:"Permission only — inference minutes billed via metering (0.10 $/min)" },
      category_metadata:{ kind:"ai_model", purpose:"caption", architecture:"transformer", weights_hash:"sha256:weightsCaption5", private_inference:true, ai_bom:{ model_id:"n0va-caption-pro", version:"5.0.0", weights_sha256:"sha256:weightsCaption5", base_models:["base-whisper"], datasets:[{ name:"dataset-name", provenance:"publisher declaration", license:"license-identifier" }], evaluation:{ wer:0.041, languages:42, safety_report:"n0va://reports/safety-500" }, rights:{ commercial_inference:true, fine_tuning:false, model_redistribution:false } } } as CategoryMetadata,
    },
    {
      slug:"voice-aria", type:"voice_pack", publisher:pub1, version:"2.1.0", status:"published", title:"Voice — Aria (Licensed)", description:"Identity-verified, consent scoped, commercial narration, territories worldwide, no political/adult impersonation.",
      content:{ artifact_uri:"n0va://artifacts/voice-aria/2.1.0", sha256:"sha256:aria", size_bytes:800000000 },
      compatibility:{ n0va_min:"4.0.0", platforms:["web","desktop","render-farm"] },
      license:{ type:"commercial", identifier:"voice-commercial-v1", commercial_use:true, territories:["worldwide"], term:"perpetual" },
      provenance:{ creator:"Aria Owner", source_declaration:"publisher-attested", state:"identity_verified" },
      security:{ scan_status:"passed", scan_version:"scanner-4.2", last_scanned_at: nowIso(), known_vulnerabilities:0, badge:"verified" },
      rights:{ commercial_video:true, voice_impersonation:false },
      pricing:{ model:"usage_based", price:0, currency:"USD", usage_included:"Per generated second — voice-generation seconds billed, distribution rights separate" },
      category_metadata:{ kind:"voice_pack", voice_owner:"Aria Owner", identity_verification:"verified", consent_document:"consent_aria_2026", consent_scope:"commercial narration", permitted_languages:["en","es"], commercial_use:true, restrictions:{ political:true, adult:true, impersonation:true }, usage_modes:["narration","dubbing"] } as CategoryMetadata,
    },
    {
      slug:"healthcare-media-pack", type:"compliance_pack", publisher:pub1, version:"1.0.0", status:"published", title:"Healthcare Media Pack", description:"HIPAA controls, evidence templates, redaction rules, retention, approval stages — provides controls, not compliance alone.",
      content:{ artifact_uri:"n0va://artifacts/healthcare-media-pack/1.0.0", sha256:"sha256:health", size_bytes:500000 },
      compatibility:{ n0va_min:"4.0.0", platforms:["web","desktop"] },
      license:{ type:"commercial", identifier:"custom-commercial-v2", commercial_use:true, territories:["worldwide"], term:"perpetual" },
      provenance:{ creator:"Example Studio", source_declaration:"publisher-attested", state:"independently_audited" },
      security:{ scan_status:"passed", scan_version:"scanner-4.2", last_scanned_at: nowIso(), known_vulnerabilities:0, badge:"verified" },
      rights:{ commercial_video:true },
      pricing:{ model:"subscription", price:199, currency:"USD" },
      category_metadata:{ kind:"compliance_pack", jurisdictions:["US"], regulations:["HIPAA"], effective_date:"2026-01-01", human_review_required:true } as CategoryMetadata,
    },
    {
      slug:"brand-compliance-agent", type:"agent_skill", publisher:pub1, version:"2.1.0", status:"published", title:"Brand Compliance Agent", description:"Checks timeline vs brand kit, writes compliance_report — deny publish external, sandbox tenant-isolated.",
      content:{ artifact_uri:"n0va://artifacts/brand-compliance-agent/2.1.0", sha256:"sha256:brandAgent21", size_bytes:2500000 },
      compatibility:{ n0va_min:"4.0.0", platforms:["web","render-farm"], required_permissions:["read:timeline","read:brand_kit"] },
      license:{ type:"commercial", identifier:"custom-commercial-v2", commercial_use:true, territories:["worldwide"], term:"perpetual" },
      provenance:{ creator:"Example Studio", source_declaration:"publisher-attested", state:"n0va_certified", signed_manifest:"n0va://manifests/brand-compliance-agent" },
      security:{ scan_status:"passed", scan_version:"scanner-4.2", last_scanned_at: nowIso(), known_vulnerabilities:0, sandbox_required:true, network_permissions:{ mode:"deny_by_default", allowed_domains:[] }, badge:"verified" },
      rights:{ commercial_video:true, training:false },
      pricing:{ model:"subscription", price:49, currency:"USD" },
      category_metadata:{ kind:"agent_skill", actions:["read:timeline","read:brand_kit"], required_permissions:["read:timeline","read:brand_kit","read:project_metadata","write:compliance_report"], capability_manifest:{ skill_id:"brand-compliance-agent", version:"2.1.0", permissions:["read:timeline","read:brand_kit","read:project_metadata","write:compliance_report"], prohibited:["publish:external","delete:asset","read:private_health_data"], network:{ mode:"deny_by_default", allowed_domains:[] }, approval:{ required_for:["block_export","modify_timeline"] } }, sandbox:{ tenant_isolation:true, resource_limits:true, network_policy:true, credential_isolation:true } } as CategoryMetadata,
    },
    {
      slug:"acme-brand-kit", type:"brand_kit", publisher:pub1, version:"2026.08", status:"published", title:"Acme Brand Kit 2026", description:"Logos, fonts, colors, LUTs, lower thirds, watermarks, export presets — required/recommended/prohibited rules.",
      content:{ artifact_uri:"n0va://artifacts/acme-brand-kit/2026.08", sha256:"sha256:acmeBrand", size_bytes:12000000 },
      compatibility:{ n0va_min:"4.0.0", platforms:["web","desktop","render-farm"] },
      license:{ type:"commercial", identifier:"custom-commercial-v2", commercial_use:true, territories:["worldwide"], term:"perpetual" },
      provenance:{ creator:"Acme Brand Team", source_declaration:"publisher-attested", state:"n0va_certified" },
      security:{ scan_status:"passed", scan_version:"scanner-4.2", last_scanned_at: nowIso(), known_vulnerabilities:0, badge:"verified" },
      rights:{ commercial_video:true },
      pricing:{ model:"one_time", price:0, currency:"USD" },
      category_metadata:{ kind:"brand_kit", rules:{ logo:{ approved_assets:["logo_primary","logo_white"], minimum_clear_space:0.08, required_on_exports:true }, fonts:{ approved:["font_acme_sans"], fallback:"font_system_sans" }, colors:{ primary:["#102A43"], accent:["#F6AD55"] }, export:{ required_presets:["acme_social_1080","acme_web_4k"] } } } as CategoryMetadata,
    },
    {
      slug:"youtube-4k-preset", type:"export_preset", publisher:pub2, version:"4.0.2", status:"published", title:"YouTube 4K Preset", description:"H264, MP4, 3840x2160, 60fps, HDR10+, validation: codec, color, loudness, caption, platform spec.",
      content:{ artifact_uri:"n0va://artifacts/youtube-4k-preset/4.0.2", sha256:"sha256:yt4k", size_bytes:50000 },
      compatibility:{ n0va_min:"4.0.0", platforms:["web","desktop","render-farm"] },
      license:{ type:"commercial", identifier:"custom-commercial-v2", commercial_use:true, territories:["worldwide"], term:"perpetual" },
      provenance:{ creator:"Cinematic Tools", source_declaration:"publisher-attested", state:"cryptographically_signed" },
      security:{ scan_status:"passed", scan_version:"scanner-4.2", last_scanned_at: nowIso(), known_vulnerabilities:0, badge:"verified" },
      rights:{ commercial_video:true },
      pricing:{ model:"one_time", price:0, currency:"USD" },
      category_metadata:{ kind:"export_preset", codec:"h264", container:"mp4", resolution:"3840x2160", hdr_format:"HDR10+" } as CategoryMetadata,
    },
    {
      slug:"sports-highlight-workflow", type:"industry_workflow", publisher:pub1, version:"1.5.0", status:"published", title:"Sports Highlight Pipeline", description:"Project schema + roles + approval gates + AI highlight + export presets + retention.",
      content:{ artifact_uri:"n0va://artifacts/sports-highlight-workflow/1.5.0", sha256:"sha256:sports", size_bytes:2000000 },
      compatibility:{ n0va_min:"4.0.0", platforms:["web","desktop","render-farm"] },
      license:{ type:"commercial", identifier:"custom-commercial-v2", commercial_use:true, territories:["worldwide"], term:"perpetual" },
      provenance:{ creator:"Example Studio", source_declaration:"publisher-attested", state:"n0va_certified" },
      security:{ scan_status:"passed", scan_version:"scanner-4.2", last_scanned_at: nowIso(), known_vulnerabilities:0, badge:"verified" },
      rights:{ commercial_video:true },
      pricing:{ model:"subscription", price:299, currency:"USD" },
      category_metadata:{ kind:"industry_workflow", roles:["producer","editor","reviewer"], stages:["ingest","edit","review","publish"], approval_gates:["producer","legal"] } as CategoryMetadata,
    },
    {
      slug:"unverified-cool-lut", type:"lut", publisher:pub3, version:"0.9.0", status:"published", title:"Unverified Cool LUT (Community)", description:"Community LUT, publisher-declared only — not independently verified, popularity does not replace trust.",
      content:{ artifact_uri:"n0va://artifacts/unverified-cool-lut/0.9.0", sha256:"sha256:unverified", size_bytes:80000 },
      compatibility:{ n0va_min:"4.0.0", platforms:["web"] },
      license:{ type:"commercial", identifier:"custom-commercial-v2", commercial_use:false, territories:["worldwide"], term:"perpetual" },
      provenance:{ creator:"Community Creator", source_declaration:"publisher-attested", state:"publisher_declared" },
      security:{ scan_status:"pending", scan_version:"scanner-4.2", last_scanned_at: nowIso(), known_vulnerabilities:0, badge:"review_required" },
      rights:{ commercial_video:false, paid_advertising:false },
      pricing:{ model:"free", price:0, currency:"USD" },
      category_metadata:{ kind:"lut", lut_format:"cube" } as CategoryMetadata,
    },
  ];
  for(const it of items) createItem(it as unknown as MarketplaceItemRecord);
  return Array.from(catalog.values());
}
export function ensureSeed(): void { if(!catalog.size) seedCatalog(); }

export function clearMarketplaceForTests(){
  catalog.clear(); catalogBySlug.clear(); publishers.clear(); entitlements.clear(); entitlementsByTenant.clear();
  installations.clear(); installationsByTenant.clear(); installationsByProject.clear(); lockfiles.clear();
  reviews.clear(); auditLog.length=0; revenueLog.length=0; provenanceAttachments.clear(); versionHistory.clear(); scanResults.clear(); publisherOnboardings.clear(); updatePolicies.clear();
}

// ── Helpers for discovery trust display ─────────────────────────────────────
export function trustSummary(item: MarketplaceItemRecord){
  return {
    commercial_use: item.rights.commercial_video ? "Worldwide" : "Restricted",
    license: item.license.term ?? "Perpetual",
    compatibility: `${item.compatibility.n0va_min}–${item.compatibility.n0va_max ?? "5.x"}`,
    security: `${item.security.scan_status}, ${item.security.known_vulnerabilities ?? 0} known issues`,
    provenance: item.provenance.state,
    dependencies: item.compatibility.required_dependencies?.length ?? 0,
  };
}
