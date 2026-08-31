import type { Prediction, OptimizationProposal, OptimizationMetrics } from "./predictive-optimization-types";
function uid(p:string){ return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso(){ return new Date().toISOString(); }
const predictions = new Map<string, Prediction>();
const proposals = new Map<string, OptimizationProposal>();

export function createPrediction(input: Omit<Prediction,"prediction_id"|"delta"|"created_at">): Prediction {
  const delta = input.predicted_score - input.baseline_score;
  const p: Prediction = { ...input, prediction_id: uid("pred"), delta, created_at: nowIso() };
  // every AI suggestion reversible — store reversible flag
  predictions.set(p.prediction_id, p); return p;
}
export function getPrediction(prediction_id:string){ return predictions.get(prediction_id) ?? null; }
export function listPredictions(tenant_id?:string){ const arr=[...predictions.values()]; return tenant_id? arr.filter(p=> p.tenant_id===tenant_id): arr; }

export function proposeOptimization(prediction_id:string, action: OptimizationProposal["action"], preview_url?:string): OptimizationProposal {
  const pred=predictions.get(prediction_id); if(!pred) throw new Error("Prediction not found");
  const prop: OptimizationProposal = {
    proposal_id: uid("opt"), prediction_id, action, preview_url,
    cost_estimate_cents: 30, policy_decision:"allow_with_audit", status:"proposed"
  };
  proposals.set(prop.proposal_id, prop); return prop;
}
export function decideProposal(proposal_id:string, decision:"approved"|"rejected"){
  const p=proposals.get(proposal_id); if(!p) throw new Error("Proposal not found");
  p.status = decision==="approved"? "approved":"rejected"; return p;
}
export function applyProposal(proposal_id:string){
  const p=proposals.get(proposal_id); if(!p) throw new Error("Proposal not found");
  if(p.status!=="approved") throw new Error("Requires approval — policy-bounded");
  p.status="applied"; return p;
}
export function rollbackProposal(proposal_id:string){
  const p=proposals.get(proposal_id); if(!p) throw new Error("Proposal not found");
  if(!predictions.get(p.prediction_id)?.reversible) throw new Error("Not reversible");
  p.status="rolled_back"; return p;
}
export function getMetrics(tenant_id?:string): OptimizationMetrics {
  const preds=listPredictions(tenant_id); const props=[...proposals.values()].filter(pr=> preds.some(p=> p.prediction_id===pr.prediction_id));
  return {
    predictions: preds.length, applied: props.filter(pr=> pr.status==="applied").length, rolled_back: props.filter(pr=> pr.status==="rolled_back").length,
    avg_delta: preds.length? preds.reduce((s,p)=>s+p.delta,0)/preds.length:0,
    avg_confidence: preds.length? preds.reduce((s,p)=>s+p.confidence,0)/preds.length:0,
    reversible_rate: preds.length? preds.filter(p=> p.reversible).length/preds.length:0
  };
}
export function clearForTests(){ predictions.clear(); proposals.clear(); }
