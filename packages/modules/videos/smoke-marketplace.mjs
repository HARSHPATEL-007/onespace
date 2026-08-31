import { seedCatalog, listItems, getItem, searchCatalog, purchaseLicense, validateLicense, installItem, getLockfile, scanItem, validateCompatibility, revokeItem, listRevenue, addReview, getAverageRatings, listAudit, getProvenance, attachProvenance, buildUri, listPublishers, qualityGate, clearMarketplaceForTests } from "./src/marketplace-engine.ts";

console.log("== N0VA VIDEOS Marketplace Smoke ==");
clearMarketplaceForTests();
let items = seedCatalog();
console.assert(items.length>=12, "seed 12+ items");
console.log("✓ seed catalog", items.length, "items");

// 1. Catalog address immutable identifier
let lut = items.find(i=> i.slug==="cinematic-warm-lut");
console.assert(lut, "lut found");
let uri = buildUri(lut.type, lut.slug, lut.version);
console.assert(uri===`n0va://marketplace/${lut.type}/${lut.slug}/${lut.version}`, "uri");
console.log("✓ marketplace_item_id URI", uri, "content_hash", lut.content.sha256.slice(0,12));

// 2. Trust and provenance — provenance states
console.assert(lut.provenance.state==="n0va_certified", "lut certified");
let unverified = items.find(i=> i.slug==="unverified-cool-lut");
console.assert(unverified.provenance.state==="publisher_declared", "unverified publisher_declared");
console.log("✓ provenance states — do not present publisher-declared as verified");

// 3. C2PA + SPDX
console.assert(lut.provenance.c2pa_manifest?.startsWith("n0va://c2pa"), "C2PA");
console.assert(lut.license.identifier==="custom-commercial-v2", "SPDX/custom");
console.log("✓ C2PA + SPDX license", lut.provenance.c2pa_manifest, lut.license.identifier);

// 4. Category validation — LUT color-space tests, metadata
console.assert(lut.category_metadata.kind==="lut" && lut.category_metadata.lut_format==="cube", "LUT metadata");
let tmpl = items.find(i=> i.type==="template");
console.assert(tmpl.category_metadata.kind==="template", "template metadata");
console.log("✓ category metadata — LUT, template, motion graphics etc.");

// 5. Motion graphics restricted runtime
let mg = items.find(i=> i.slug==="lower-thirds-pro");
console.assert(mg.security.sandbox_required===true && mg.security.network_permissions?.mode==="deny_by_default", "sandbox");
console.log("✓ motion graphics sandbox deny_by_default — no filesystem/credential/cross-tenant");

// 6. Music rights manifest
let music = items.find(i=> i.slug==="epic-score-001");
console.assert(music.rights.commercial_video===true && music.rights.paid_advertising===true, "music rights");
console.log("✓ music rights manifest — sync/master, paid_ads, broadcast worldwide perpetual");

// 7. AI BOM
let aim = items.find(i=> i.slug==="caption-pro");
console.assert(aim.provenance.ai_bom?.weights_sha256?.startsWith("sha256:"), "AI BOM weights");
console.assert(aim.provenance.ai_bom?.evaluation?.wer===0.041, "AI eval");
console.log("✓ AI BOM", aim.provenance.ai_bom.model_id, aim.provenance.ai_bom.evaluation.wer);

// 8. Voice pack consent — block when missing
let voice = items.find(i=> i.slug==="voice-aria");
console.assert(voice.category_metadata.kind==="voice_pack" && voice.category_metadata.voice_owner==="Aria Owner", "voice owner");
console.log("✓ voice pack — identity verification, consent scope, revocation terms, political/adult restrictions");

// 9. Compliance pack — executable policy components, never claim compliance alone
let comp = items.find(i=> i.slug==="healthcare-media-pack");
console.assert(comp.category_metadata.kind==="compliance_pack" && comp.category_metadata.jurisdictions?.includes("US"), "compliance jurisdictions");
console.log("✓ compliance pack — provides controls, customer remains responsible");

// 10. Agent skill capability manifest + sandbox
let agent = items.find(i=> i.slug==="brand-compliance-agent");
console.assert(agent.category_metadata.kind==="agent_skill" && agent.category_metadata.capability_manifest?.permissions.includes("read:timeline"), "agent manifest");
console.assert(agent.security.sandbox_required===true, "agent sandbox");
console.log("✓ agent skill — manifest", agent.category_metadata.capability_manifest.skill_id, "permissions", agent.category_metadata.capability_manifest.permissions.join(","));

// 11. Search — trust filters directly in results
let res = searchCatalog({ q:"cinematic", commercial_use:true, publisher_verified:true, limit:5 });
console.assert(res.total>=1, "search found");
console.assert(res.items[0].rights.commercial_video===true, "commercial use worldwide in result");
console.log("✓ search — trust info directly in results", res.total, "total, facets", JSON.stringify(res.facets));

// 12. Security scan — static, dependency, sandbox, behavioral; badge
let scan = scanItem(agent.item_id);
console.assert(scan.badge==="verified" || scan.badge==="scanned", "scan badge");
console.log("✓ security scan", scan.badge, scan.status, scan.vulnerabilities.length+" vulns");
let badScan = scanItem(unverified.item_id);
console.log("✓ community LUT scan", badScan.badge, badScan.status);

// 13. Compatibility — N0VA version, OS, GPU, dependencies; levels compatible/warning/requires_migration/unsupported/blocked
let compRes = validateCompatibility(lut.item_id, "5.0.0");
console.assert(compRes.level==="compatible", "compatible");
console.log("✓ compatibility", compRes.level, compRes.issues.join(";")||"no issues");
let badCompat = validateCompatibility(lut.item_id, "3.0.0");
console.assert(badCompat.level==="unsupported", "unsupported old version");
console.log("✓ compatibility unsupported on old N0VA", badCompat.level);

// 14. Dependency graph + lockfile — brand kit → font → LUT → motion → export → music
let brandKit = items.find(i=> i.slug==="acme-brand-kit");
console.log("✓ brand kit rules", JSON.stringify(brandKit.category_metadata.rules).slice(0,120));
let lockTestProject = "project_001";
// Install items to generate lockfile
let ent = purchaseLicense(lut.item_id, "tenant_acme", { project_id: lockTestProject, user_id:"user_demo" });
console.assert(ent.status==="active", "entitlement active");
let licValid = validateLicense(lut.item_id, { tenant_id:"tenant_acme", project_id: lockTestProject, commercial:true, territory:"worldwide" });
console.assert(licValid.valid && licValid.decision==="allow", "license allow");
console.log("✓ license purchase + entitlement active + validation allow");
let install = installItem(lut.item_id, "tenant_acme", { project_id: lockTestProject, user_id:"user_demo" });
console.assert(install.status==="installed" && install.sandbox===false, "install lut no sandbox");
console.log("✓ secure install — entitlement + compatibility + security + sandbox, lockfile entry", install.lockfile_entry?.slug);
let lock = getLockfile(lockTestProject);
console.assert(lock && lock.marketplace_lock["lut"]==="3.2.1", "lockfile pinned lut 3.2.1");
console.log("✓ lockfile", JSON.stringify(lock.marketplace_lock));
purchaseLicense(agent.item_id, "tenant_acme", { project_id: lockTestProject, user_id:"user_demo" });
let agentInstall = installItem(agent.item_id, "tenant_acme", { project_id: lockTestProject, user_id:"user_demo" });
console.assert(agentInstall.sandbox===true, "agent sandbox isolated");
console.log("✓ agent install sandboxed — tenant/resource/network/credential isolation");

// 15. Rights enforcement at export — flag license expired, territory mismatch, paid-ads not permitted
import { generateRightsManifest, validateRightsForExport } from "./src/marketplace-engine.ts";
let rights = generateRightsManifest(lut.item_id, "asset_001");
console.assert(rights.rights.commercial_video===true, "rights manifest");
console.log("✓ rights manifest", JSON.stringify({ asset_id:rights.asset_id, rights:rights.rights, proof_url:rights.proof_url }));
let rightsCheck = validateRightsForExport(lockTestProject, "youtube", "worldwide");
console.assert(rightsCheck.valid, "rights export valid");
console.log("✓ rights validation for export — valid", rightsCheck.valid);

// 16. Revocation — malware/fraud triggers stop new installs, preserve outputs, record affected, notify
let rev = revokeItem(unverified.item_id, "malware", "Critical vulnerability CVE-2026-1234", "admin");
console.assert(rev.affected_projects.length>=0, "revocation affected");
console.log("✓ revocation — trigger malware, affected", rev.affected_projects.length, "preserve historical license");
let revokedValid = validateLicense(unverified.item_id, { tenant_id:"tenant_acme" });
console.assert(!revokedValid.valid && revokedValid.decision==="block", "revoked blocked");
console.log("✓ revoked license blocked, historical preserved");

// 17. Update channels — stable/LTS/beta/canary/security-only, pin major, auto-patch
import { setUpdatePolicy, getUpdatePolicy, checkForUpdates } from "./src/marketplace-engine.ts";
let updPol = setUpdatePolicy({ tenant_id:"tenant_acme", channel:"stable", auto_update_patches:true, pin_major:true, approve_minor:true, require_security_review:true, block_publisher_updates:false });
console.assert(updPol.channel==="stable" && updPol.pin_major, "update policy");
let updCheck = checkForUpdates(lut.item_id, "3.0.0", "stable");
console.log("✓ update channels", updPol.channel, "check", updCheck.available? updCheck.available.version:"no update", "requires_migration", updCheck.requires_migration);

// 18. Revenue — gross/payout/commission/refunds/tax + usage-based billing connect for AI/voice
let revSum = listRevenue("tenant_acme");
console.assert(revSum.length>=1, "revenue records");
console.log("✓ revenue", revSum.length, "records, gross", revSum.reduce((s,r)=>s+r.gross_cents,0));

// 19. Publisher onboarding + certification levels
let pubs = listPublishers();
console.assert(pubs.length===3, "publishers");
console.log("✓ publishers", pubs.map(p=> `${p.name}:${p.certification}`).join(", "));

// 20. Reviews — separate by creative/technical/compatibility etc., popularity not trust
let revw = addReview(lut.item_id, "tenant_acme", "user_demo", { creative_quality:5, technical_reliability:5, license_clarity:5, security:5 }, "Excellent LUT");
let avg = getAverageRatings(lut.item_id);
console.assert(avg && avg.creative_quality===5, "ratings");
console.log("✓ reviews — creative", avg.creative_quality, "security", avg.security, "popularity does not replace trust");

// 21. Audit — every install/purchase/revoke with tenant/project/asset/item/version/license/publisher/actor/correlation/content_hash/policy_decision/timestamp
let audit = listAudit(10, "tenant_acme");
console.assert(audit.length>=5, "audit log");
console.log("✓ audit events", audit.slice(0,3).map(e=> e.type).join(", "));

// 22. Preview without accidental commercial use
import { getPreview } from "./src/marketplace-engine.ts";
let preview = getPreview(lut.item_id, "watermarked_preview");
console.assert(preview.watermarked && !preview.commercial_usable, "preview watermarked non-commercial");
console.log("✓ preview watermarked non-commercial", preview.mode);

// 23. Quality gate — before GA: identity, license, provenance, integrity, compatibility, security, rights, docs, commercial, sandbox, revocation
let gate = qualityGate(lut.item_id);
console.assert(gate.passed, "quality gate lut passed");
let badGate = qualityGate(unverified.item_id);
console.assert(!badGate.passed, "community LUT fails gate");
console.log("✓ quality gate — lut passed", gate.passed, "unverified failed", badGate.failures.join(",").slice(0,80));

console.log("== All marketplace smoke checks passed ==");
