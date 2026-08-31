"use client";
import { useState } from "react";
import { Badge, Button } from "@n0va/ui";
export function RenderOrchestrationPanel({ tenantId="tenant_acme", projectId="project_001" }: { tenantId?: string; projectId?: string }){
  const [job, setJob] = useState<unknown>(null);
  const create = async()=>{
    const { createRenderJob } = await import("./render-orchestration-engine");
    const j=createRenderJob({ tenant_id: tenantId, project_id: projectId!, graph_version:"gv_001", preset:"hls_abr", region:"eu-west-1", priority:"high", gpu_class:"H100", provenance:{ actor:"user_demo", correlation_id:`corr_${Date.now()}`, explainable_params:{ preset:"hls_abr", gpu:"H100" } } });
    setJob(j);
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", gap:8 }}><Button size="sm" onClick={create}>Create Multi-Region Render (policy: residency regional, approval for cross-region)</Button>{!!job && <Badge tone={(job as {status:string}).status==="policy_blocked"?"danger":"success"}>{(job as {status:string}).status}</Badge>}</div>
      <pre style={{ background:"#0f0f12", color:"#e5e7eb", padding:12, borderRadius:8, overflow:"auto", fontSize:11 }}>{JSON.stringify(job ?? { note:"No job — create to see shards per region, explainable provenance, shard output_hash reversible" }, null, 2)}</pre>
      <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Multi-region shards, every render explainable, every retry auditable, data residency enforced, spot policy, max_parallel, region utilization metrics.</div>
    </div>
  );
}
