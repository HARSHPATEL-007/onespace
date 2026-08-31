"use client";
import { useEffect, useState } from "react";
import { Badge, Button } from "@n0va/ui";
import type { SyncLink } from "./workspace-sync-types";
export function WorkspaceSyncPanel({ tenantId="tenant_acme", projectId="project_001" }: { tenantId?: string; projectId?: string }){
  const [links, setLinks] = useState<SyncLink[]>([]);
  const refresh = async()=>{
    const { listLinks } = await import("./workspace-sync-engine");
    setLinks(listLinks(tenantId));
  };
  useEffect(()=>{ void refresh(); }, []);
  const create = async()=>{
    const { linkEntities } = await import("./workspace-sync-engine");
    linkEntities({ tenant_id: tenantId, source:{ module:"videos", entity:"timeline", id: projectId! }, target:{ module:"tasks", entity:"task", id:`task_${Date.now()}` }, provenance:{ actor:"user_demo", correlation_id:`corr_${Date.now()}`, policy_version:"sync-v1" } });
    void refresh();
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", gap:8 }}><Button size="sm" onClick={create}>Link Timeline ↔ Task (CRDT, auditable)</Button><Button size="sm" variant="secondary" onClick={refresh}>Refresh</Button><Badge tone="neutral">{links.length} links</Badge></div>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr style={{ background:"var(--nv-color-surface-2)" }}><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Source → Target</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Status</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Provenance</th></tr></thead>
          <tbody>
            {links.slice(0,8).map(l=>(
              <tr key={l.link_id}>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{l.source.module}:{l.source.entity}:{l.source.id.slice(0,8)} → {l.target.module}:{l.target.entity}:{l.target.id.slice(0,8)}</td>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}><Badge tone={l.status==="synced"?"success": l.status==="conflict"?"danger":"warning"}>{l.status}</Badge></td>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)", fontSize:11 }}>{l.provenance.actor} • {l.provenance.policy_version}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Cross-module sync: project↔task↔calendar↔chat↔approval, CRDT clock, conflict manual_merge, policy explainable, every decision auditable, workflow synchronized.</div>
    </div>
  );
}
