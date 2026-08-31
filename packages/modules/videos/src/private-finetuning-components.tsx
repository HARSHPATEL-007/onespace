"use client";
import { useState } from "react";
import { Badge, Button } from "@n0va/ui";
export function PrivateFinetuningPanel({ tenantId="tenant_acme" }: { tenantId?: string }){
  const [job, setJob] = useState<unknown>(null);
  const [model, setModel] = useState<unknown>(null);
  const create = async()=>{
    const { createFinetuneJob, advanceFinetune } = await import("./private-finetuning-engine");
    const j=createFinetuneJob({ tenant_id: tenantId, base_model_id:"n0va-caption-pro", base_version:"5.0.0", scope:"caption", dataset_hashes:[`sha256:dataset_${Date.now()}`], consent_chain:[`consent_${Date.now()}`] });
    setJob(j);
    if(j.status==="queued"){
      const res=advanceFinetune(j.job_id, "training");
      setTimeout(()=> {
        const r2=advanceFinetune(j.job_id, "ready");
        setModel((r2 as {model: unknown}).model);
        setJob((r2 as {job: unknown}).job);
      }, 800);
    }
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", gap:8 }}><Button size="sm" onClick={create}>Fine-tune Private Model (caption, tenant-isolated, consent-aware)</Button>{!!job && <Badge tone={(job as {status:string}).status==="blocked_policy"?"danger":"success"}>{(job as {status:string}).status}</Badge>}</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800, fontSize:12 }}>Finetune Job — explainable lineage, never cross-tenant</div><pre style={{ fontSize:11, whiteSpace:"pre-wrap" }}>{JSON.stringify(job ?? { note:"No job — requires consent_chain, dataset_hashes, tenant_isolated" }, null, 2)}</pre></div>
        <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800, fontSize:12 }}>Private Model — C2PA + SPDX BOM per tenant</div><pre style={{ fontSize:11, whiteSpace:"pre-wrap" }}>{JSON.stringify(model ?? { note:"No model — advance to ready to mint private weights" }, null, 2)}</pre></div>
      </div>
      <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Private fine-tuning: per-tenant isolated, consent chain, dataset lineage, policy blocked if no consent, C2PA/SPDX, never cross-tenant, auditable.</div>
    </div>
  );
}
