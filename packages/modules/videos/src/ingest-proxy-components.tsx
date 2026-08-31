"use client";
import { useEffect, useState } from "react";
import { Badge, Button } from "@n0va/ui";
import type { IngestJob } from "./ingest-proxy-types";
export function IngestProxyPanel({ tenantId="tenant_acme" }: { tenantId?: string }){
  const [jobs, setJobs] = useState<IngestJob[]>([]);
  const [q, setQ] = useState("");
  const refresh = async()=>{
    try{
      const { listIngestJobs, searchAssets } = await import("./ingest-proxy-engine");
      if(q) setJobs(searchAssets(tenantId, q) as IngestJob[]);
      else setJobs(listIngestJobs(tenantId));
    }catch{}
  };
  useEffect(()=>{ void refresh(); }, [q]);
  const create = async()=>{
    const { createIngestJob } = await import("./ingest-proxy-engine");
    createIngestJob({ tenant_id: tenantId, source:"upload", original_name:`clip_${Date.now()}.mp4`, mime:"video/mp4", bytes: 500*1024*1024, checksum:{ algo:"sha256", value:`sha256:${Math.random().toString(36).slice(2,10)}` }, audit:{ actor:"user_demo", correlation_id:`corr_${Date.now()}` } });
    void refresh();
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        <input className="nv-input" placeholder="Semantic search — every asset searchable" value={q} onChange={e=> setQ(e.target.value)} style={{ minWidth:240 }} />
        <Button size="sm" onClick={create}>Ingest (idempotent, checksum, proxy queued)</Button>
        <Badge tone="neutral">{jobs.length} jobs</Badge>
      </div>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr style={{ background:"var(--nv-color-surface-2)" }}><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Job</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Status</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Proxies</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Audit</th></tr></thead>
          <tbody>
            {jobs.slice(0,10).map(j=>(
              <tr key={j.job_id}>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{j.original_name}<div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>{j.checksum.value.slice(0,16)}… • {j.idempotency_key.slice(0,12)}</div></td>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}><Badge tone={j.status==="ready"?"success": j.status==="failed"?"danger":"warning"}>{j.status}</Badge></td>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{j.proxy_jobs.map(p=> `${p.tier}:${p.status}`).join(" | ")}</td>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)", fontSize:11 }}>{j.audit.actor} • {j.audit.correlation_id.slice(0,8)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Reliable ingest: content_hash dedup, container/codec validation, malware scan, policy explainable block, proxy tiers thumb→preview→edit→mezzanine reversible, C2PA provenance, every asset searchable.</div>
    </div>
  );
}
