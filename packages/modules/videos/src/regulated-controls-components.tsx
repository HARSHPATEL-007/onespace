"use client";
import { useState } from "react";
import { Badge, Button } from "@n0va/ui";
export function RegulatedControlsPanel({ tenantId="tenant_acme" }: { tenantId?: string }){
  const [holds, setHolds] = useState<unknown[]>([]);
  const [audit, setAudit] = useState<unknown[]>([]);
  const refresh = async()=>{
    const { listHolds, listAudits } = await import("./regulated-controls-engine");
    setHolds(listHolds(tenantId));
    setAudit(listAudits(tenantId));
  };
  const place = async()=>{
    const { placeHold } = await import("./regulated-controls-engine");
    placeHold({ tenant_id: tenantId, domain:"healthcare", reason:"Litigation hold — PHI asset", asset_id:"asset_001", custodian:"custodian_01", matter_id:"matter_2026", actor:"compliance_officer", correlation_id:`corr_${Date.now()}` });
    void refresh();
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", gap:8 }}><Button size="sm" onClick={place}>Place Legal Hold (healthcare)</Button><Button size="sm" variant="secondary" onClick={refresh}>Refresh</Button><Badge tone="neutral">{holds.length} holds</Badge></div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800, fontSize:12 }}>Legal Holds — disposition requires approval</div><pre style={{ fontSize:11, whiteSpace:"pre-wrap" }}>{JSON.stringify(holds.slice(0,3) ?? [], null, 2)}</pre></div>
        <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800, fontSize:12 }}>Regulated Audit — explainable, policy_version</div><pre style={{ fontSize:11, whiteSpace:"pre-wrap" }}>{JSON.stringify(audit.slice(0,3) ?? [], null, 2)}</pre></div>
      </div>
      <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Regulated: legal hold active blocks delete, WORM retention, disposition approval, data residency, every decision explainable & auditable, domain healthcare/legal/finance/public_sector.</div>
    </div>
  );
}
