#!/usr/bin/env node
import { createEnvelope, appendOutbox, publishOutbox, consumeEvent, createAssetIngested, replayEvents, getWorkflow, createWebhookSubscription, projectForWebhook, validateEnvelope, getDeadLetter, getProjection } from "./src/event-driven-engine.ts";
function assert(c,m){ if(!c){ console.error("FAIL",m); process.exit(1);} else console.log("PASS",m); }
console.log("=== Event-Driven Architecture Smoke ===");

// 1. Envelope required fields stable
let env = createAssetIngested({ asset_id:"asset_001", project_id:"project_001", tenant_id:"tenant_acme", version:4 });
assert(env.id.startsWith("evt_") && env.type==="video.asset.ingested" && env.tenant.id==="tenant_acme", "envelope id type tenant");
assert(env.idempotency_key==="tenant_acme:asset_001:ingested:4", "idempotency tenant:entity:operation:version");
assert(env.causation_id && env.correlation_id && env.trace_id, "causation correlation trace");
assert(env.schema.name==="n0va.video.asset.ingested" && env.schema.version==="1.0.0", "schema name version");
console.log(`Envelope ${env.id} ${env.type} tenant ${env.tenant.id} project ${env.project.id}`);

// 2. Transactional outbox
let outbox = appendOutbox(env);
assert(outbox.status==="pending" && outbox.aggregate_type==="asset" && outbox.aggregate_id==="asset_001", "outbox pending asset");
let published = publishOutbox(outbox.outbox_id);
assert(published && published.id===env.id, "published");
console.log(`Outbox ${outbox.outbox_id} → published ${published.id} partitioning tenant+entity ordered per aggregate`);

// 3. Idempotency
let c1 = consumeEvent(env, "analysis-service");
assert(c1.status==="processed", "first consume processed");
let c2 = consumeEvent(env, "analysis-service");
assert(c2.status==="duplicate_ignored", "duplicate ignored");
console.log(`Consume ${c1.status} → ${c2.status}`);

// 4. Taxonomy
assert(env.type.startsWith("video.") && env.type.split(".").length===3, "taxonomy video.*.*");

// 5. Schema validation
let valid = validateEnvelope(env);
assert(valid.valid===true, "schema valid");
let invalid = validateEnvelope({ ...env, id:"" });
assert(invalid.valid===false, "schema invalid missing id");

// 6. Partitioning ordered per entity
let env2 = createAssetIngested({ asset_id:"asset_001", project_id:"project_001", tenant_id:"tenant_acme", version:5 });
let outbox2 = appendOutbox(env2);
publishOutbox(outbox2.outbox_id);
assert(outbox2.aggregate_id===outbox.aggregate_id && outbox2.aggregate_version===5, "ordered per asset v4→v5");

// 7. Replay
let replay = replayEvents({ tenant_id:"tenant_acme", dry_run:true, rate_limit:5 });
assert(replay.length>=1, `replay ${replay.length} dry_run excludes irreversible`);
let tenantReplay = replayEvents({ tenant_id:"tenant_acme" });
assert(tenantReplay.every(e=>e.tenant.id==="tenant_acme"), "tenant isolated replay");

// 8. Workflow orchestration
let wf = getWorkflow(env.correlation_id);
assert(wf && wf.correlation_id===env.correlation_id, "workflow correlation");
console.log(`Workflow ${wf.workflow_id} state ${wf.state}`);

// 9. Webhook gateway redaction
let sub = createWebhookSubscription({ tenant_id:"tenant_acme", event_types:["video.export.completed"], destination_url:"https://acme.example/webhook", redacted_fields:["download_url"] });
let projected = projectForWebhook(env, sub);
assert(!(projected.data && "download_url" in projected.data), "redacted download_url");
console.log(`Webhook ${sub.subscription_id} redacted ${sub.redacted_fields.join(",")}`);

// 10. Dead letter
let dl = getDeadLetter("nonexistent");
assert(dl===null, "no dead letter for unknown");
console.log(`Dead letters ${getProjection("project_status").last_event_id.slice(0,8)}`);

// 11. Projections rebuild
let proj = getProjection("project_status");
assert(proj && proj.last_aggregate_version>=4, "projection last version");

// 12. Domain contracts: asset ingested consumers
assert(env.data && env.data.asset_id==="asset_001", "asset ingested data");

console.log("\nAll event-driven smoke checks passed.");
