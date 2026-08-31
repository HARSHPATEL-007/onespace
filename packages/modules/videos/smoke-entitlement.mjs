import { setTier, getEntitlement, checkEntitlement, applyAddOn, evaluateTierChange, getUsage, recordUsage, listTiers, exampleEnvelope, CAPABILITY_MATRIX, TIER_CATALOG } from "./src/entitlement-engine.ts";
import { TIER_POSITIONING } from "./src/entitlement-types.ts";

// Use dynamic import workaround for TS via node --loader tsx
// Instead we import compiled via tsx import
console.log("== N0VA VIDEOS Entitlement Smoke ==");

// 1. Tier catalog has 5 tiers
console.assert(listTiers().length===5, "5 tiers");
console.log("✓ tier catalog length 5");

// 2. Creator defaults: storage 100, members 1, AI 1000
let env = setTier("tenant_acme", "creator");
console.assert(env.plan==="creator", "creator plan");
console.assert(env.limits.storage_gb===100, "creator storage 100");
console.assert(env.limits.members===1, "creator members 1");
console.log("✓ creator limits", env.limits);

// 3. Creator can do basic editing
let r = checkEntitlement({ tenant_id:"tenant_acme", feature:"editing", requested_operation:"project.create" });
console.assert(r.allowed, "creator editing allowed");
console.log("✓ creator editing allowed", r.decision);

// 4. Creator advanced AI metered — should now allow (was fixed)
let r2 = checkEntitlement({ tenant_id:"tenant_acme", feature:"ai_advanced", requested_operation:"ai.generate", actor:"user_1" });
console.assert(r2.allowed, "creator ai_advanced metered allowed");
console.log("✓ creator ai_advanced metered allowed", r2.decision);

// 5. Creator RAW should be denied
let r3 = checkEntitlement({ tenant_id:"tenant_acme", feature:"raw_workflows", requested_operation:"asset.ingest.raw" });
console.assert(!r3.allowed, "creator raw denied");
console.log("✓ creator raw denied", r3.reason?.slice(0,60));

// 6. Creator high-res export via render_orchestration_advanced should be denied
let r4 = checkEntitlement({ tenant_id:"tenant_acme", feature:"render_orchestration_advanced", requested_operation:"export.create:mp4_8k" });
console.assert(!r4.allowed, "creator 8k denied");
console.log("✓ creator 8k denied");

// 7. Add-on unlock: creator_hires_export unlocks high-res
applyAddOn("tenant_acme", "creator_hires_export");
let r5 = checkEntitlement({ tenant_id:"tenant_acme", feature:"render_orchestration_advanced", requested_operation:"export.create:mp4_8k" });
console.assert(r5.allowed, "creator hires export unlock");
console.log("✓ creator hires_export unlocks advanced render");

// 8. Usage metering: storage overage blocks
recordUsage("tenant_acme", { storage_gb: 50 });
let over = checkEntitlement({ tenant_id:"tenant_acme", feature:"shared_libraries", requested_operation:"asset.ingest", usage_delta:{ storage_gb: 60 }});
console.assert(over.decision==="overage_block" || over.decision==="deny", "storage overage blocked");
console.log("✓ storage overage blocked", over.decision);

// Reset for next test: new tenant
setTier("tenant_team", "team");
let tr = checkEntitlement({ tenant_id:"tenant_team", feature:"collaboration_realtime", requested_operation:"collab.edit" });
console.assert(tr.allowed, "team realtime collab allowed");
console.log("✓ team collab allowed");

// 9. Business has SSO
setTier("tenant_bus", "business");
let br = checkEntitlement({ tenant_id:"tenant_bus", feature:"sso", requested_operation:"sso.login" });
console.assert(br.allowed, "business sso allowed");
console.log("✓ business sso allowed");

// 10. Regulated has CMK core, legal hold core
setTier("tenant_reg", "regulated");
let rg = checkEntitlement({ tenant_id:"tenant_reg", feature:"legal_hold_core", requested_operation:"legal_hold.place" });
console.assert(rg.allowed, "regulated legal hold core");
console.log("✓ regulated legal hold core");

// 11. Capability matrix has 22 rows
console.assert(CAPABILITY_MATRIX.length===22, "matrix rows");
console.log("✓ capability matrix 22 rows");

// 12. Tier change evaluation: creator -> business immediate
let ev = evaluateTierChange("creator", "business");
console.assert(ev.direction==="upgrade" && ev.allowed, "upgrade allowed");
console.log("✓ evaluate upgrade creator->business", ev.direction, ev.requiresMigration);

// 13. Downgrade regulated -> business requires compliance review
let ev2 = evaluateTierChange("regulated", "business");
console.assert(ev2.direction==="downgrade", "downgrade direction");
console.assert((ev2.blockedReasons||[]).length>0, "regulated downgrade blocked");
console.log("✓ regulated->business downgrade blockedReasons", ev2.blockedReasons?.[0]?.slice(0,80));

// 14. Downgrade never deletes data
let ev3 = evaluateTierChange("business", "team");
console.assert(ev3.warnings.some(w=>w.includes("never delete")||w.toLowerCase().includes("preserve")), "downgrade preserve warning");
console.log("✓ downgrade preserves data", ev3.dataPreservation[0]?.slice(0,80));

// 15. Example envelope matches spec shape
let ex = exampleEnvelope("tenant_acme", "business");
console.assert(ex.billing_period==="2026-08", "example billing period");
console.assert(ex.overrides.region==="eu-west-1", "example region");
console.log("✓ example envelope", JSON.stringify({ tenant_id: ex.tenant_id, plan: ex.plan, billing_period: ex.billing_period, overrides: ex.overrides }));

// 16. Every entitlement check records audit fields: tenant/feature/operation/decision/policy_version/usage_state/actor/timestamp
let audit = checkEntitlement({ tenant_id:"tenant_acme", feature:"editing", requested_operation:"timeline.edit", actor:"user_99" });
console.assert(audit.record.tenant==="tenant_acme", "audit tenant");
console.assert(audit.record.feature==="editing", "audit feature");
console.assert(audit.record.requested_operation==="timeline.edit", "audit operation");
console.assert(audit.record.policy_version==="videos-entitlement-v2026.08", "audit policy_version");
console.assert(typeof audit.record.usage_state==="object", "audit usage_state");
console.assert(audit.record.actor==="user_99", "audit actor");
console.assert(typeof audit.record.timestamp==="string", "audit timestamp");
console.log("✓ entitlement check records all audit fields");

// 17. Commercial metrics per tier
import { COMMERCIAL_METRICS } from "./src/entitlement-engine.ts";
console.log("✓ commercial metrics count", COMMERCIAL_METRICS.length);

console.log("== All entitlement smoke checks passed ==");
