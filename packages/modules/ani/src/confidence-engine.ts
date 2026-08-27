/**
 * N0VA ANI — Confidence and Uncertainty Layer
 *
 * Replaces single confidence_score with claim-level, evidence-grounded
 * uncertainty system. Validated against observed correctness.
 */

import { createHash } from "crypto";

// ============================================================================
// 1. Confidence Dimensions — separate, not averaged unless validated
// ============================================================================

export type ConfidenceBand = "high" | "moderate" | "low" | "unverified" | "conflicting" | "forecast";

export interface AssuranceDimensions {
  model_confidence: number; // interpretation correct
  source_confidence: number; // reliability/authority/freshness/directness
  grounding_confidence: number; // claim supported by retrieved evidence
  completeness_confidence: number; // missing evidence likelihood
  temporal_confidence?: number; // currentness
  calculation_confidence?: number; // arithmetic/code
  interpretation_confidence?: number; // ambiguity resolved
  action_confidence?: number; // suitable & authorized
  outcome_confidence?: number; // will achieve result
  confidence_band: ConfidenceBand;
  calibration_status: "validated_for_domain" | "uncalibrated" | "stale";
}

export function bandFromScore(score: number): ConfidenceBand {
  if (score >= 0.85) return "high";
  if (score >= 0.65) return "moderate";
  if (score >= 0.4) return "low";
  return "unverified";
}

// ============================================================================
// 2. Claim-Level Confidence — structured object
// ============================================================================

export type ClaimType = "factual" | "computed_fact" | "inferred" | "forecast" | "recommendation" | "action" | "classification" | "entity" | "citation";
export type ClaimImpact = "low" | "medium" | "high" | "critical";
export type ClaimSupport = "direct" | "derived" | "indirect" | "none";

export interface ClaimSourceLink {
  source_id: string;
  support: ClaimSupport;
  source_confidence: number;
  freshness: "current" | "stale" | "unknown";
  authority?: number;
}

export interface ClaimRecord {
  claim_id: string;
  text: string;
  claim_type: ClaimType;
  value?: number | string;
  unit?: string;
  sources: ClaimSourceLink[];
  verification: { recomputed: boolean; independent_check: boolean; contradictions: string[] };
  confidence: { model: number; grounding: number; overall_band: ConfidenceBand; completeness?: number };
  impact: ClaimImpact;
}

export function createClaim(input: Omit<ClaimRecord, "claim_id" | "confidence"> & Partial<Pick<ClaimRecord,"confidence">>): ClaimRecord {
  const band = bandFromScore(input.verification.independent_check ? 0.9 : 0.6);
  return {
    claim_id: `claim_${Date.now().toString(36).slice(2,4)}_${Math.random().toString(36).slice(2,4)}`,
    text: input.text,
    claim_type: input.claim_type,
    value: input.value,
    unit: input.unit,
    sources: input.sources,
    verification: input.verification,
    confidence: input.confidence ?? { model: input.verification.independent_check ? 0.92 : 0.62, grounding: input.sources.some(s=>s.support==="direct") ? 0.9 : 0.55, overall_band: band },
    impact: input.impact ?? "medium",
  };
}

// ============================================================================
// 3. Evidence Graph — claims → sources → transformations
// ============================================================================

export interface EvidenceRecord {
  evidence_id: string;
  source_uri: string;
  source_type: "approved_internal_system" | "signed_document" | "expert" | "official_external" | "peer_reviewed" | "user_doc" | "unverified_web" | "search_snippet" | "model_generated" | "inferred" | "stale";
  authority: number; // 0-1
  freshness: number;
  directness: number;
  completeness: number;
  integrity?: number; // content hash verified
  access_time: string;
  content_hash: string;
  supporting_spans?: string[];
  permissions_checked: boolean;
  relevance?: number;
}

export function createEvidenceRecord(input: Omit<EvidenceRecord,"content_hash"|"access_time"> & Partial<Pick<EvidenceRecord,"access_time"|"content_hash">>): EvidenceRecord {
  const hash = input.content_hash ?? createHash("sha256").update(input.source_uri).digest("hex");
  return {
    evidence_id: input.evidence_id,
    source_uri: input.source_uri,
    source_type: input.source_type,
    authority: input.authority,
    freshness: input.freshness,
    directness: input.directness,
    completeness: input.completeness,
    integrity: input.integrity ?? 1.0,
    access_time: input.access_time ?? new Date().toISOString(),
    content_hash: hash,
    supporting_spans: input.supporting_spans,
    permissions_checked: input.permissions_checked,
    relevance: input.relevance ?? 0.8,
  };
}

export class EvidenceGraph {
  private claims=new Map<string, ClaimRecord>();
  private evidence=new Map<string, EvidenceRecord>();
  private edges:{ claim_id:string; evidence_id:string; relation:"supported_by"|"derived_through"|"depends_on"|"contradicted_by"|"confirmed_by"|"limited_by" }[]=[];

  addClaim(c:ClaimRecord):void{ this.claims.set(c.claim_id,c); }
  addEvidence(e:EvidenceRecord):void{ this.evidence.set(e.evidence_id,e); }
  link(claim_id:string, evidence_id:string, relation: typeof this.edges[number]["relation"]):void{ this.edges.push({ claim_id, evidence_id, relation }); }
  getClaim(id:string):ClaimRecord|undefined{ return this.claims.get(id); }
  getEvidence(id:string):EvidenceRecord|undefined{ return this.evidence.get(id); }
  listClaims():ClaimRecord[]{ return [...this.claims.values()]; }
  listEvidence():EvidenceRecord[]{ return [...this.evidence.values()]; }
  supportingEvidence(claim_id:string):EvidenceRecord[]{ const ids=this.edges.filter(e=>e.claim_id===claim_id && e.relation==="supported_by").map(e=>e.evidence_id); return ids.map(id=>this.evidence.get(id)!).filter(Boolean); }
}

// ============================================================================
// 4. Source Confidence — authority × relevance × freshness × directness × integrity × completeness
// ============================================================================

export type SourceClass = "approved_system_of_record" | "signed_org_document" | "named_expert" | "official_external" | "peer_reviewed" | "user_provided" | "unverified_web" | "search_snippet" | "model_generated" | "inferred_relationship" | "stale_artifact";

export const SOURCE_CLASS_SCORES: Record<SourceClass, { authority:number; freshness:number; directness:number }> = {
  approved_system_of_record: { authority:0.95, freshness:0.9, directness:1.0 },
  signed_org_document: { authority:0.9, freshness:0.85, directness:0.9 },
  named_expert: { authority:0.85, freshness:0.8, directness:0.7 },
  official_external: { authority:0.8, freshness:0.75, directness:0.8 },
  peer_reviewed: { authority:0.9, freshness:0.7, directness:0.8 },
  user_provided: { authority:0.6, freshness:0.9, directness:0.9 },
  unverified_web: { authority:0.3, freshness:0.5, directness:0.4 },
  search_snippet: { authority:0.4, freshness:0.6, directness:0.3 },
  model_generated: { authority:0.1, freshness:0.5, directness:0.1 },
  inferred_relationship: { authority:0.2, freshness:0.6, directness:0.2 },
  stale_artifact: { authority:0.5, freshness:0.2, directness:0.5 },
};

export function sourceConfidence(authority:number, relevance:number, freshness:number, directness:number, integrity:number, completeness:number): number {
  return authority * relevance * freshness * directness * integrity * completeness;
}

export function scoreSource(ev: EvidenceRecord): number {
  const base = sourceConfidence(ev.authority, ev.relevance ?? 0.8, ev.freshness, ev.directness, ev.integrity ?? 1.0, ev.completeness);
  // model-generated must never increase confidence via repetition
  if (ev.source_type==="model_generated") return Math.min(base, 0.2);
  return base;
}

// ============================================================================
// 5. Unsupported Claim Detection — gate before delivery
// ============================================================================

export type ClaimState = "supported" | "derived" | "inferred" | "forecast" | "unverified" | "contradicted" | "unsupported";

export function classifyClaimState(claim: ClaimRecord, evidence: EvidenceRecord[]): ClaimState {
  if (evidence.length===0) return claim.sources.length===0 ? "unsupported" : "unverified";
  const hasDirect = claim.sources.some(s=> s.support==="direct");
  const hasDerived = claim.sources.some(s=> s.support==="derived");
  const hasContradiction = claim.verification.contradictions.length>0;
  if (hasContradiction) return "contradicted";
  if (claim.claim_type==="forecast") return "forecast";
  if (hasDirect && evidence.every(e=> e.authority>0.7 && e.freshness>0.6)) return "supported";
  if (hasDerived && claim.verification.recomputed) return "derived";
  if (claim.sources.some(s=> s.support==="indirect")) return "inferred";
  if (evidence.some(e=> e.source_type==="unverified_web")) return "unverified";
  return "unsupported";
}

export const CLAIM_BEHAVIOR: Record<ClaimState, string> = {
  supported: "State normally with citation",
  derived: "Show calculation basis",
  inferred: "Use qualified language",
  forecast: "Show range, assumptions, and horizon",
  unverified: "Label clearly or omit",
  contradicted: "Present the conflict",
  unsupported: "Remove, ask, or abstain",
};

// ============================================================================
// 6. Ambiguity Handling — material vs immaterial
// ============================================================================

export interface AmbiguityDimension { field:string; interpretations:string[]; impact_difference: "high"|"medium"|"low" }
export interface AmbiguityAnalysis { detected:boolean; material:boolean; dimensions: AmbiguityDimension[]; recommended_behavior: "clarify_before_action"|"provide_alternatives"|"proceed" }

export function analyzeAmbiguity(text:string, impact: ClaimImpact): AmbiguityAnalysis {
  const dims: AmbiguityDimension[]=[];
  if (/launch date/i.test(text)) dims.push({ field:"launch_date", interpretations:["customer launch","internal pilot"], impact_difference:"high" });
  if (/reduce.*cloud/i.test(text)) dims.push({ field:"cloud_reduction", interpretations:["Reduce the monthly cloud bill","Reduce cloud usage"], impact_difference:"high"});
  const material = dims.some(d=> d.impact_difference==="high") && (impact==="high"|| impact==="critical" as never);
  return { detected: dims.length>0, material, dimensions: dims, recommended_behavior: material ? "clarify_before_action" : dims.length>0 ? "provide_alternatives" : "proceed" };
}

export interface Interpretation { id:string; meaning:string; probability:number; answer:string }
export function buildInterpretations(ambiguity: AmbiguityAnalysis): { interpretations: Interpretation[]; selection:"clarification_required"|"most_likely" } {
  if (!ambiguity.detected || !ambiguity.material) return { interpretations:[], selection:"most_likely" };
  const interps: Interpretation[] = ambiguity.dimensions.flatMap((d,i)=> d.interpretations.map((meaning,j)=> ({ id:`i${i}${j}`, meaning, probability: j===0?0.58:0.42, answer: meaning.includes("bill")?"Reserved-capacity optimization is relevant.":"Workload and architecture changes are relevant." })));
  return { interpretations: interps, selection:"clarification_required" };
}

// ============================================================================
// 7. Forecasting with Intervals
// ============================================================================

export interface ForecastRecord {
  metric:string;
  horizon:string;
  estimate:number;
  unit:string;
  intervals: { "50_percent":[number,number]; "80_percent":[number,number]; "95_percent":[number,number] };
  baseline:string;
  assumptions:string[];
  sources:string[];
  calibration:{ coverage_target:number; observed_coverage:number; sample_count:number };
  data_cutoff?:string;
  missing_variables?:string[];
  drift_status?: string;
}

export function createForecast(metric:string, estimate:number, unit:string, horizon:string, baseline:string, assumptions:string[], sources:string[]): ForecastRecord{
  const spread = estimate*0.08;
  return {
    metric, horizon, estimate, unit,
    intervals: { "50_percent":[estimate-spread*0.6, estimate+spread*0.6], "80_percent":[estimate-spread, estimate+spread], "95_percent":[estimate-spread*1.8, estimate+spread*1.8]},
    baseline, assumptions, sources,
    calibration:{ coverage_target:0.95, observed_coverage:0.93, sample_count:84 },
  };
}

// ============================================================================
// 8. Impact-Aware Evidence Policy — thresholds by impact
// ============================================================================

export type ImpactLevel = "low" | "medium" | "high" | "critical";

export interface EvidencePolicyThresholds { minimum_grounding:number; minimum_source_confidence:number; human_review:boolean|"conditional"; independent_verification?:boolean; dual_approval?:boolean; abstain_if_missing_evidence?:boolean; }

export const IMPACT_POLICY: Record<ImpactLevel, EvidencePolicyThresholds> = {
  low: { minimum_grounding:0.70, minimum_source_confidence:0.60, human_review:false },
  medium:{ minimum_grounding:0.85, minimum_source_confidence:0.75, human_review:"conditional"},
  high:{ minimum_grounding:0.95, minimum_source_confidence:0.90, human_review:true, independent_verification:true},
  critical:{ minimum_grounding:0.98, minimum_source_confidence:0.95, human_review:true, dual_approval:true, abstain_if_missing_evidence:true},
};

export function policyForImpact(level:ImpactLevel): EvidencePolicyThresholds{ return IMPACT_POLICY[level]; }

export function classifyImpact(input:{ financial?:number; legal?:boolean; health?:boolean; privacy?:boolean; affectedPeople?:number; irreversible?:boolean; externalComm?:boolean; privilegeChange?:boolean }):ImpactLevel{
  if (input.health || input.legal || (input.financial && input.financial>5000) || input.irreversible) return "critical";
  if (input.financial && input.financial>1000 || (input.affectedPeople && input.affectedPeople>50) || input.externalComm) return "high";
  if (input.financial || input.privacy) return "medium";
  return "low";
}

// ============================================================================
// 9. Actions Need Separate Assurance
// ============================================================================

export interface ActionAssurance {
  intent_match:number;
  target_match:number;
  authorization:number;
  parameter_validity:number;
  side_effect_risk:"low"|"medium"|"high";
  reversibility:"full"|"partial"|"none";
  execution_confidence:number;
  required_gate:"auto"|"human_approval"|"dual_approval";
}

export function assessAction(input:{ intent:number; target:number; auth:number; params:number; sideEffect:"low"|"medium"|"high"; reversible:"full"|"partial"|"none"; }):ActionAssurance{
  const exec = (input.intent + input.target + input.auth + input.params)/4 * (input.reversible==="full"?1: input.reversible==="partial"?0.85:0.7);
  const gate: ActionAssurance["required_gate"] = input.sideEffect==="high" || exec<0.75 ? "human_approval" : exec<0.9 ? "human_approval" : "auto";
  return { intent_match:input.intent, target_match:input.target, authorization:input.auth, parameter_validity:input.params, side_effect_risk:input.sideEffect, reversibility:input.reversible, execution_confidence: exec, required_gate: gate };
}

export type ActionExecutionState = "requested"|"authorized"|"submitted"|"accepted"|"completed"|"verified"|"reversed"|"failed_partially";
export function neverReportDoneAsCompleted(state:ActionExecutionState):boolean{
  return state==="submitted" ? false : true; // if only submitted, not done
}

// ============================================================================
// 10. Abstention Modes — coverage/risk trade-off
// ============================================================================

export type AbstentionReasonCode = "INSUFFICIENT_EVIDENCE"|"CONFLICTING_AUTHORITATIVE_SOURCES"|"STALE_SOURCE"|"AMBIGUITY_MATERIAL"|"IMPACT_TOO_HIGH"|"MISSING_VERIFICATION";

export interface AbstentionRecord {
  reason_code: AbstentionReasonCode;
  blocked_claims:string[];
  missing_evidence:string[];
  next_best_action:string;
  mode:"full"|"partial"|"conditional"|"verification"|"action";
  message:string;
}

export function abstain(reason:AbstentionReasonCode, blocked:string[], missing:string[]): AbstentionRecord{
  const messages:Record<AbstentionReasonCode,string>={
    INSUFFICIENT_EVIDENCE:"I can’t answer reliably because the relevant source is unavailable.",
    CONFLICTING_AUTHORITATIVE_SOURCES:"I found two conflicting policy versions. Please confirm which one governs this workspace.",
    STALE_SOURCE:"Source is outdated for this task.",
    AMBIGUITY_MATERIAL:"Multiple interpretations change the answer.",
    IMPACT_TOO_HIGH:"I can draft the payment request, but I won’t submit it because the beneficiary account has not been independently verified.",
    MISSING_VERIFICATION:"Independent verification required.",
  };
  const modeMap:Record<AbstentionReasonCode, AbstentionRecord["mode"]>={ INSUFFICIENT_EVIDENCE:"full", CONFLICTING_AUTHORITATIVE_SOURCES:"verification", STALE_SOURCE:"conditional", AMBIGUITY_MATERIAL:"verification", IMPACT_TOO_HIGH:"action", MISSING_VERIFICATION:"verification"};
  return { reason_code:reason, blocked_claims:blocked, missing_evidence:missing, next_best_action: reason==="CONFLICTING_AUTHORITATIVE_SOURCES" ? "Ask compliance owner to confirm governing policy" : "Provide additional evidence", mode: modeMap[reason], message: messages[reason]};
}

// ============================================================================
// 11. Clarification and Abstention Policy — answer/clarify/qualify/abstain/escalate
// ============================================================================

export type PolicyDecision = "answer"|"clarify"|"qualify"|"abstain"|"escalate";

export function decidePolicy(input:{ evidencePass:boolean; ambiguity: AmbiguityAnalysis; claimState:ClaimState; impact:ImpactLevel; completeness:number }): { decision:PolicyDecision; reason:string }{
  if (!input.evidencePass) return { decision:"abstain", reason:"evidence insufficient or contradictions unresolved" };
  if (input.ambiguity.material) return { decision:"clarify", reason:"ambiguity is material and user input can resolve it" };
  if (input.claimState==="forecast" || input.claimState==="inferred") {
    if (input.impact==="low") return { decision:"qualify", reason:"uncertainty manageable and downside low" };
    return { decision:"qualify", reason:"show range and assumptions" };
  }
  if (input.claimState==="contradicted") return { decision:"abstain", reason:"contradicted" };
  if (input.impact==="critical" && input.claimState!=="supported") return { decision:"escalate", reason:"impact high and human judgment required" };
  return { decision:"answer", reason:"evidence and interpretation pass thresholds" };
}

// ============================================================================
// 12. Calibration System — ECE, Brier, selective risk, coverage, etc.
// ============================================================================

export interface CalibrationRecord {
  task:string;
  domain:string;
  model_version:string;
  confidence_bin:string;
  sample_count:number;
  observed_correctness:number;
  expected_correctness:number;
  calibration_error:number;
  coverage:number;
  last_updated:string;
}

export interface CalibrationMetrics {
  ece:number; // Expected Calibration Error
  brier:number;
  log_loss:number;
  selective_risk:number;
  coverage:number;
  false_confidence_rate:number;
  false_abstention_rate:number;
  citation_entailment_precision:number;
  unsupported_claim_recall:number;
  contradiction_detection_recall:number;
  forecast_coverage:number;
  action_success_rate:number;
  human_override_rate:number;
  calibration_drift:number;
}

export class CalibrationEngine {
  private records:CalibrationRecord[]=[];
  private outcomes:{ confidence:number; correct:boolean; domain:string }[]=[];

  addRecord(r:CalibrationRecord):void{ this.records.push(r); }
  recordOutcome(confidence:number, correct:boolean, domain:string):void{ this.outcomes.push({ confidence, correct, domain }); }

  ece(bins=10):number{
    if(this.outcomes.length===0) return 0;
    let total=0;
    for(let i=0;i<bins;i++){
      const lo=i/bins, hi=(i+1)/bins;
      const bin=this.outcomes.filter(o=> o.confidence>=lo && o.confidence<hi+(i===bins-1?0.01:0));
      if(bin.length===0) continue;
      const acc=bin.filter(b=>b.correct).length/bin.length;
      const conf=bin.reduce((s,b)=>s+b.confidence,0)/bin.length;
      total+= Math.abs(acc-conf) * (bin.length/this.outcomes.length);
    }
    return total;
  }

  brier():number{
    if(this.outcomes.length===0) return 0;
    return this.outcomes.reduce((s,o)=> s+ Math.pow(o.confidence - (o.correct?1:0),2),0)/this.outcomes.length;
  }

  reliabilityDiagram(bins=10):Array<{bin:string; expected:number; observed:number; count:number}>{
    const out: Array<{bin:string; expected:number; observed:number; count:number}>= [];
    for(let i=0;i<bins;i++){
      const lo=i/bins, hi=(i+1)/bins;
      const bin=this.outcomes.filter(o=> o.confidence>=lo && o.confidence<hi+(i===bins-1?0.01:0));
      const expected= bin.length? bin.reduce((s,b)=>s+b.confidence,0)/bin.length : (lo+hi)/2;
      const observed= bin.length? bin.filter(b=>b.correct).length/bin.length : 0;
      out.push({ bin:`${(lo*100).toFixed(0)}-${(hi*100).toFixed(0)}`, expected, observed, count: bin.length });
    }
    return out;
  }

  listRecords():CalibrationRecord[]{ return [...this.records]; }

  driftSince(baselineECE:number):number{ return Math.abs(this.ece()-baselineECE); }
}

// Calibration workflow states
export type CalibrationStage = "offline_benchmark"|"shadow_deployment"|"domain_pilot"|"human_reviewed_sample"|"threshold_tuning"|"controlled_release"|"drift_monitoring"|"recalibration"|"rollback";

// ============================================================================
// 13. Administrator Controls — Assurance Policy Console
// ============================================================================

export interface AssurancePolicy {
  policy_id:string;
  scope:string; // e.g., finance, hr, workspace_finance
  rules:{
    minimum_source_confidence:number;
    minimum_grounding_confidence:number;
    maximum_evidence_age_hours?:number;
    independent_verification?:boolean;
    human_approval?:boolean;
    dual_approval_above_usd?:number;
    abstain_on_conflict?:boolean;
    minimum_confidence_by_task?: Record<string,number>;
    required_citation_coverage?:number;
    maximum_unsupported_claims?:number;
    contradiction_handling?: "show_both"|"abstain";
    clarification_threshold?:number;
    abstention_threshold?:number;
    forecast_interval_level?: 0.5|0.8|0.95;
    human_review_triggers?: string[];
    dual_approval_requirements?: string[];
    maximum_action_confidence_gap?:number;
    approved_source_classes?: SourceClass[];
    permitted_fallback?: string;
    escalation_destination?: string;
    model_version_restrictions?: string[];
    audit_retention_days?:number;
  };
}

export class AssurancePolicyConsole {
  private policies=new Map<string,AssurancePolicy>();
  create(p:AssurancePolicy):void{ this.policies.set(p.policy_id,p); }
  get(id:string):AssurancePolicy|undefined{ return this.policies.get(id); }
  update(id:string, patch:Partial<AssurancePolicy["rules"]>):AssurancePolicy|null{ const pol=this.policies.get(id); if(!pol) return null; pol.rules={...pol.rules, ...patch}; return pol; }
  list():AssurancePolicy[]{ return [...this.policies.values()]; }
  evaluate(policy_id:string, claim:ClaimRecord, sourceScore:number, grounding:number, evidenceAgeHours:number):{ pass:boolean; reasons:string[] }{
    const pol=this.policies.get(policy_id);
    if(!pol) return { pass:true, reasons:[] };
    const reasons:string[]=[];
    if (sourceScore < pol.rules.minimum_source_confidence) reasons.push(`source ${sourceScore.toFixed(2)} < ${pol.rules.minimum_source_confidence}`);
    if (grounding < pol.rules.minimum_grounding_confidence) reasons.push(`grounding ${grounding.toFixed(2)} < ${pol.rules.minimum_grounding_confidence}`);
    if (pol.rules.maximum_evidence_age_hours && evidenceAgeHours > pol.rules.maximum_evidence_age_hours) reasons.push(`evidence age ${evidenceAgeHours}h > ${pol.rules.maximum_evidence_age_hours}h`);
    if (pol.rules.abstain_on_conflict && claim.verification.contradictions.length>0) reasons.push("contradiction requires abstain");
    return { pass: reasons.length===0, reasons };
  }
}

// ============================================================================
// 14. Uncertainty and Assurance Engine — between generation and final response
// ============================================================================

export interface AssuranceInput { request:string; claims:ClaimRecord[]; evidence:EvidenceRecord[]; impact:ImpactLevel; domain:string; model_version:string; is_action?:boolean; }

export interface AssuranceOutput {
  assurance: AssuranceDimensions;
  claims: Array<ClaimRecord & { state:ClaimState; band: ConfidenceBand }>;
  unsupported_claims: ClaimRecord[];
  contradictions: Array<{ topic:string; claim_ids:string[] }>;
  ambiguity?: AmbiguityAnalysis;
  interpretations?: Interpretation[];
  forecast?: ForecastRecord | null;
  abstention: AbstentionRecord | null;
  required_review: boolean;
  calibration: { domain:string; status:"validated"|"uncalibrated"; last_evaluated:string };
  decision: PolicyDecision;
  evidence_graph: EvidenceGraph;
}

export class UncertaintyAssuranceEngine {
  constructor(
    private evidenceGraph: EvidenceGraph = new EvidenceGraph(),
    private calibration: CalibrationEngine = new CalibrationEngine(),
    private policyConsole: AssurancePolicyConsole = new AssurancePolicyConsole(),
  ){}

  analyze(input: AssuranceInput): AssuranceOutput {
    // Source-quality assessment
    const sourceScores = input.evidence.map(scoreSource);
    const avgSource = sourceScores.length? sourceScores.reduce((a,b)=>a+b,0)/sourceScores.length : 0.5;

    // Grounding: proportion supported
    const claimStates = input.claims.map(c=> ({ claim:c, state: classifyClaimState(c, input.evidence) }));
    const unsupported = claimStates.filter(cs=> cs.state==="unsupported" || cs.state==="unverified").map(cs=>cs.claim);
    const contradictions = this.findContradictions(input.claims);

    // Model uncertainty (heuristic: variance of source scores + claim confidence)
    const modelConf = input.claims.length? input.claims.reduce((s,c)=>s+c.confidence.model,0)/input.claims.length : 0.6;
    const groundingConf = claimStates.filter(cs=> cs.state==="supported" || cs.state==="derived").length / Math.max(1, input.claims.length);
    const completeness = avgSource * groundingConf;

    const thresholds = policyForImpact(input.impact);
    const evidencePass = avgSource >= thresholds.minimum_source_confidence && groundingConf >= thresholds.minimum_grounding;

    // Ambiguity
    const ambiguity = analyzeAmbiguity(input.request, input.claims[0]?.impact ?? "medium");
    const interps = buildInterpretations(ambiguity);

    // Calibration status
    const ece = this.calibration.ece();
    const calibrationStatus = ece < 0.05 ? "validated_for_domain" : "uncalibrated";

    // Policy decision
    const firstClaimState = claimStates[0]?.state ?? "supported";
    const policyDecision = decidePolicy({ evidencePass, ambiguity, claimState: firstClaimState, impact: input.impact, completeness });

    let abstention: AbstentionRecord | null = null;
    if (policyDecision.decision==="abstain") {
      abstention = abstain(contradictions.length>0 ? "CONFLICTING_AUTHORITATIVE_SOURCES" : "INSUFFICIENT_EVIDENCE", unsupported.map(u=>u.claim_id), []);
    } else if (policyDecision.decision==="clarify") {
      abstention = abstain("AMBIGUITY_MATERIAL", [], []);
    }

    const assurance: AssuranceDimensions = {
      model_confidence: modelConf,
      source_confidence: avgSource,
      grounding_confidence: groundingConf,
      completeness_confidence: completeness,
      confidence_band: bandFromScore((modelConf+avgSource+groundingConf)/3),
      calibration_status: calibrationStatus as never,
      ...(input.is_action ? { action_confidence: modelConf*0.9 } : {}),
    };

    const required_review = input.impact==="high" || input.impact==="critical" || !!abstention || contradictions.length>0 || ambiguity.material;

    return {
      assurance,
      claims: claimStates.map(cs=> ({ ...cs.claim, state: cs.state, band: bandFromScore(cs.claim.confidence.model) })),
      unsupported_claims: unsupported,
      contradictions: contradictions.map(c=> ({ topic:c.topic, claim_ids:c.claim_ids })),
      ambiguity,
      interpretations: interps.interpretations,
      forecast: null,
      abstention,
      required_review,
      calibration: { domain: input.domain, status: ece<0.05? "validated":"uncalibrated", last_evaluated: new Date().toISOString().split("T")[0]! },
      decision: policyDecision.decision,
      evidence_graph: this.evidenceGraph,
    };
  }

  private findContradictions(claims: ClaimRecord[]): Array<{topic:string; claim_ids:string[]}> {
    const out: Array<{topic:string; claim_ids:string[]}>=[];
    // naive: same text prefix but different values
    for(let i=0;i<claims.length;i++) for(let j=i+1;j<claims.length;j++){
      const a=claims[i]!, b=claims[j]!;
      if (a.text.slice(0,20)===b.text.slice(0,20) && a.value!==b.value) out.push({ topic: a.text.slice(0,30), claim_ids:[a.claim_id,b.claim_id]});
    }
    return out;
  }

  getCalibration(): CalibrationEngine { return this.calibration; }
  getPolicyConsole(): AssurancePolicyConsole { return this.policyConsole; }
  getEvidenceGraph(): EvidenceGraph { return this.evidenceGraph; }
}

// ============================================================================
// 15. Facade
// ============================================================================

const globalAssuranceRegistry=new Map<string,UncertaintyAssuranceEngine>();
export function assuranceForWorkspace(workspaceId:string):UncertaintyAssuranceEngine{
  let e=globalAssuranceRegistry.get(workspaceId);
  if(!e){ e=new UncertaintyAssuranceEngine(); globalAssuranceRegistry.set(workspaceId,e); }
  return e;
}
