"use client";
import { useState } from "react";
import { Badge, Button } from "@n0va/ui";
export function PredictiveOptimizationPanel({ tenantId="tenant_acme", assetId="asset_001" }: { tenantId?: string; assetId?: string }){
  const [pred, setPred] = useState<unknown>(null);
  const [prop, setProp] = useState<unknown>(null);
  const create = async()=>{
    const { createPrediction, proposeOptimization } = await import("./predictive-optimization-engine");
    const p=createPrediction({ tenant_id: tenantId, asset_id: assetId!, signal:"retention", baseline_score:0.62, predicted_score:0.78, confidence:0.84, explainable:{ top_factors:[{ factor:"trim_silence", weight:0.42 },{ factor:"thumbnail", weight:0.31 }], model_version:"opt-v5" }, reversible:true, requires_consent:false });
    setPred(p);
    const pr=proposeOptimization(p.prediction_id, "trim_silence", `https://preview.n0va.io/${p.prediction_id}.mp4`);
    setProp(pr);
  };
  const approve = async()=>{
    const { decideProposal, applyProposal } = await import("./predictive-optimization-engine");
    const p=prop as {proposal_id:string};
    if(!p) return;
    decideProposal(p.proposal_id, "approved");
    applyProposal(p.proposal_id);
    setProp({ ...p, status:"applied" });
  };
  const rollback = async()=>{
    const { rollbackProposal } = await import("./predictive-optimization-engine");
    const p=prop as {proposal_id:string};
    if(!p) return;
    rollbackProposal(p.proposal_id);
    setProp({ ...p, status:"rolled_back" });
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", gap:8 }}><Button size="sm" onClick={create}>Predict (retention 0.62→0.78, explainable)</Button><Button size="sm" variant="secondary" onClick={approve}>Approve & Apply (policy-bounded)</Button><Button size="sm" variant="ghost" onClick={rollback}>Rollback (reversible)</Button></div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800, fontSize:12 }}>Prediction — every optimization explainable</div><pre style={{ fontSize:11, whiteSpace:"pre-wrap" }}>{JSON.stringify(pred ?? { note:"No prediction" }, null, 2)}</pre></div>
        <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800, fontSize:12 }}>Proposal — every AI action reversible</div><pre style={{ fontSize:11, whiteSpace:"pre-wrap" }}>{JSON.stringify(prop ?? { note:"No proposal" }, null, 2)}</pre></div>
      </div>
      <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Predictive: retention/ctr/completion, baseline→predicted delta, confidence, top_factors, model_version, reversible, requires_consent, policy-bounded pipeline.</div>
    </div>
  );
}
