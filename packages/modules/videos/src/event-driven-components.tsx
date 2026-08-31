"use client";
import { useState, useMemo } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import {
  createEnvelope, appendOutbox, publishOutbox, consumeEvent, createAssetIngested, replayEvents, getWorkflow, createWebhookSubscription, projectForWebhook, getObservability, getProjection, listDeadLetters,
} from "./event-driven-engine";

export function EventDrivenPanel({ projectId }: { projectId: string }) {
  const [lastEnvelope, setLastEnvelope] = useState(() => createAssetIngested({ asset_id:"asset_001", project_id:"project_001", tenant_id:"tenant_acme", version:4 }));
  const [outboxId, setOutboxId] = useState<string | null>(null);
  const [consumeStatus, setConsumeStatus] = useState<string>("");
  const obs = useMemo(()=>getObservability(),[lastEnvelope,consumeStatus]);
  const workflow = useMemo(()=>getWorkflow(lastEnvelope.correlation_id),[lastEnvelope,consumeStatus]);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ background:"linear-gradient(135deg,#0f0f12 0%,#1a243a 100%)", color:"#fff", borderRadius:12, padding:16, border:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize:11, letterSpacing:"0.08em", opacity:0.7, fontWeight:800 }}>EVENT-DRIVEN ARCHITECTURE — CONNECTIVE TISSUE · TENANT-ISOLATED · DURABLE · REPLAYABLE</div>
        <div style={{ fontSize:14, fontWeight:900, marginTop:4 }}>Domain service → Outbox → Broker → Schema → Consumers → Workflow/Policy/Projection/Webhook</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8, fontSize:11 }}>
          <span style={{ background:"rgba(255,255,255,0.08)", padding:"4px 8px", borderRadius:999 }}>At-least-once · Partition tenant/entity · Ordered per entity · Durable · Replay · DLQ</span>
          <span style={{ background:"rgba(255,255,255,0.08)", padding:"4px 8px", borderRadius:999 }}>Ingestion→Analysis→Editing→Review→Approval→Compliance→Export→Delivery→Storage→Legal→Workspace→Audit</span>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1.1fr 0.9fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Standard Envelope — CloudEvents-like + N0VA governance</div>
          <div style={{ marginTop:8, fontSize:11, background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", border:"1px solid #222" }}>
            <div>id {lastEnvelope.id.slice(0,16)}… type {lastEnvelope.type} source {lastEnvelope.source} subject {lastEnvelope.subject}</div>
            <div>tenant {lastEnvelope.tenant.id} region {lastEnvelope.tenant.region} classification {lastEnvelope.tenant.classification}</div>
            <div>project {lastEnvelope.project.id} v{lastEnvelope.project.version} entity {lastEnvelope.entity.type}:{lastEnvelope.entity.id} v{lastEnvelope.entity.version}</div>
            <div>causation {lastEnvelope.causation_id.slice(0,12)} correlation {lastEnvelope.correlation_id.slice(0,12)} trace {lastEnvelope.trace_id.slice(0,12)}</div>
            <div>actor {lastEnvelope.actor.id} {lastEnvelope.actor.type} {lastEnvelope.actor.role} idempotency {lastEnvelope.idempotency_key}</div>
            <div>schema {lastEnvelope.schema.name} v{lastEnvelope.schema.version} data_classification {lastEnvelope.data_classification} policy {lastEnvelope.policy_decision_id ?? "—"}</div>
          </div>
          <div style={{ display:"flex", gap:6, marginTop:6 }}>
            <Button size="sm" onClick={()=>{
              const env = createAssetIngested({ asset_id:`asset_${Date.now().toString(36)}`, project_id:"project_001", tenant_id:"tenant_acme" });
              setLastEnvelope(env);
            }}>Create asset.ingested</Button>
            <Button size="sm" variant="ghost" onClick={()=>{
              const rec = appendOutbox(lastEnvelope);
              setOutboxId(rec.outbox_id);
              alert(`Outbox ${rec.outbox_id} pending tenant ${rec.tenant_id} aggregate ${rec.aggregate_type}:${rec.aggregate_id} v${rec.aggregate_version}`);
            }}>Append outbox (transactional)</Button>
            <Button size="sm" variant="ghost" onClick={()=>{
              if (!outboxId) return alert("Append first");
              const published = publishOutbox(outboxId);
              alert(`Published ${published?.id} partitioned by tenant+entity ordered per aggregate`);
            }}>Publish to broker</Button>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Idempotency & Consumer — exactly-once business effect</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
              <div>Idempotency key: {lastEnvelope.idempotency_key}</div>
              <div>tenant:entity:operation:version → tenant_acme:asset_001:ingest:4</div>
              <div>Event ID dedup + business key dedup</div>
            </div>
            <div style={{ display:"flex", gap:6, marginTop:6 }}>
              <Button size="sm" onClick={()=>{
                const res = consumeEvent(lastEnvelope,"analysis-service");
                setConsumeStatus(res.status);
                alert(`Consume ${res.status}`);
              }}>Consume (analysis-service)</Button>
              <Button size="sm" variant="ghost" onClick={()=>{
                const res = consumeEvent(lastEnvelope,"analysis-service");
                setConsumeStatus(res.status);
                alert(`Duplicate ${res.status} — ignored`);
              }}>Consume duplicate</Button>
              <Badge tone={consumeStatus==="processed"?"success":"neutral"}>{consumeStatus || "not consumed"}</Badge>
            </div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Inbox pattern: exists(idempotency_key)? duplicate_ignored : transaction applyBusinessEffect + insert inbox</div>
          </div>
        </Card>
      </div>

      <Card padded>
        <div style={{ fontWeight:800 }}>Canonical Taxonomy — versioned namespace</div>
        <div style={{ marginTop:8, fontSize:11, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          <div style={{ background:"#0f0f12", color:"#e2e8f0", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", border:"1px solid #222" }}>
            <div>video.asset.ingested / quarantined / deleted · video.analysis.completed/failed · video.timeline.changed/created/published · video.review.comment.created/resolved</div>
            <div>video.approval.granted/revoked · video.compliance.failed/passed · video.export.requested/completed/failed · video.delivery.started/completed/failed/retried</div>
            <div>video.consent.granted/revoked · video.legal_hold.applied/released · video.storage.tier.changed · video.agent.action.executed</div>
          </div>
          <div style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
            <div>Workflow: video.approval.granted → policy evaluate → export job → video.export.completed → policy re-evaluate → delivery job → video.delivery.completed → workspace/analytics</div>
            <div style={{ marginTop:6 }}>Current workflow {workflow?.workflow_id?.slice(0,12) ?? "none"} state {workflow?.state ?? "—"} steps {workflow?.steps.length ?? 0}</div>
            <div>Priority: Critical consent/legal/compliance/delivery partial → High approval/delivery/storage → Normal ingest/analysis → Low preview/thumbnail</div>
          </div>
        </div>
      </Card>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Outbox + Broker + Replay + DLQ</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div>Topics n0va.video.asset/analysis/timeline/review/approval/compliance/export/delivery/consent/legal/storage/agent partitioned by tenant_id+entity_type+entity_id ordered per entity</div>
            <div style={{ display:"flex", gap:6, marginTop:6 }}>
              <Button size="sm" variant="ghost" onClick={()=>{
                const events = replayEvents({ tenant_id:"tenant_acme", dry_run:true, rate_limit:5 });
                alert(`Replay ${events.length} events dry_run excludes irreversible delivery/deletion, rate limited`);
              }}>Replay tenant_acme dry_run 5</Button>
              <Button size="sm" variant="ghost" onClick={()=>{
                const dls = listDeadLetters();
                alert(`Dead letters ${dls.length} — quarantine security/tenant-isolation violations`);
              }}>List DLQ</Button>
            </div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Delivery: at-least-once, ordered per aggregate, durable retry, dead-letter, replay, backpressure, cross-region replication, tenant quotas, schema validation</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Webhook Gateway — governed, redacted, signed</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <Button size="sm" onClick={()=>{
              const sub = createWebhookSubscription({ tenant_id:"tenant_acme", event_types:["video.export.completed"], destination_url:"https://acme.example/webhook", redacted_fields:["download_url","ip_address"] });
              const projected = projectForWebhook(lastEnvelope, sub);
              alert(`Sub ${sub.subscription_id} redacted download_url? ${"download_url" in (projected.data as object) ? "no" : "yes redacted"}`);
            }}>Create webhook subscription (redacted)</Button>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Tenant-specific subscriptions, field-level redaction, signing, mTLS, IP allowlist, retry, DLQ, replay, version negotiation — internal topics not directly subscribed</div>
            <div style={{ marginTop:6, background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, fontFamily:"var(--nv-font-mono)", fontSize:10 }}>
              <div>External payload: id type schema_version occurred_at tenant_id project_id entity {`{type:export}` } data status checksum (no sensitive URL/IP)</div>
            </div>
          </div>
        </Card>
      </div>

      <Card padded>
        <div style={{ fontWeight:800 }}>Observability + Security + Projections</div>
        <div style={{ marginTop:8, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, fontSize:11 }}>
          <div style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
            <div>Throughput {obs.event_throughput} · publish p95 {obs.publish_latency_p95_ms}ms · duplicate {(obs.duplicate_rate as number).toFixed(2)} · DLQ {obs.dead_letter_volume}</div>
            <div>SLOs: 99.99% publication, no silent loss, p95 &lt;250ms, critical &lt;2s, duplicate 0, DLQ SLA</div>
          </div>
          <div style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
            <div>Security: tenant-scoped encrypted transit/at rest signed classified access-controlled redacted audited — separate keys operational/consent/legal/health</div>
            <div>Consumers authorized by event type + tenant: analysis-service subscribes video.asset.ingested only for tenant_acme</div>
          </div>
          <div style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
            <div>Projections: project_status last {getProjection("project_status")?.last_event_id.slice(0,8)} v{getProjection("project_status")?.last_aggregate_version}</div>
            <div>Stale detection via last_event_id/version/schema</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
