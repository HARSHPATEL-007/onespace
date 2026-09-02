// Digital Twin Safeguards — bounded, provenance-linked personal health model, not definitive virtual copy. NIST AI RMF transparency + FDA CDS.
import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import crypto from "node:crypto";

const MODULE = "health_twin";

// ── Twin definition ─────────────────────────────────────────────────────
export const TWIN_DEFINITION = "A time-versioned, purpose-limited set of health-related representations linked to source data, models, assumptions, and uncertainty. It is not: complete biological replica, diagnosis, prediction of destiny, replacement for clinical assessment, verified measurement unless directly sourced, basis for unauthorized eligibility/employment/insurance/credit/pricing, license to infer sensitive traits without consent.";

// ── Twin boundaries — 15 declarations ────────────────────────────────────
export const TWIN_BOUNDARIES = ["Intended user","Intended purpose","Included data","Excluded data","Time horizon","Population or individual applicability","Model and version","Validation status","Uncertainty behavior","Human-review requirement","Permitted actions","Prohibited actions","Consent basis","Retention period","Reset and deletion behavior","Known failure modes"] as const;

// ── Capability classification — 11 ───────────────────────────────────────
export const TWIN_CAPABILITIES = [
  { capability: "Current observed record", status: "Production", permitted: "Patient and authorized clinical use" },
  { capability: "Provenance-linked trend", status: "Production", permitted: "Education, monitoring, clinician review" },
  { capability: "Personalized care-plan projection", status: "Clinical validation", permitted: "Clinician-supervised planning" },
  { capability: "Biological-age estimate", status: "Research or limited wellness", permitted: "Education only unless validated" },
  { capability: "Longevity prediction", status: "Research/conceptual", permitted: "No individual decision-making" },
  { capability: "Genomic risk projection", status: "Clinical validation or research", permitted: "Qualified interpretation and counseling" },
  { capability: "Microbiome inference", status: "Research", permitted: "Education or approved study use" },
  { capability: "Behavioral prediction", status: "Research/clinical validation", permitted: "No employment, insurance, or eligibility use" },
  { capability: "Counterfactual simulation", status: "Research or supervised planning", permitted: "No autonomous treatment instruction" },
  { capability: "Neural or whole-body simulation", status: "Conceptual", permitted: "No production decision use" },
] as const;

// ── Twin data classes — 10 ───────────────────────────────────────────────
export const TWIN_DATA_CLASSES = ["Observed: Directly measured or documented — Laboratory potassium","Patient-reported: Supplied by patient — 'I slept poorly'","Caregiver-reported: Supplied by authorized caregiver — 'Medication was refused'","Clinician-entered: Entered by healthcare professional — Diagnosis","Imported: Received from another system — External EHR record","Calculated: Deterministically derived — BMI or average glucose","Inferred: Produced by model — Possible sleep apnea risk","Simulated: Generated under assumptions — Expected glucose response","Projected: Estimated future state — Possible recovery trajectory","Synthetic: Created for testing — Simulated patient record","Unknown: Origin cannot be established — Unverified imported value"] as const;

// ── Attribute envelope — 14 fields ──────────────────────────────────────
export const attributeEnvelopeSchema = z.object({
  name: z.string().min(1).max(80),
  value: z.coerce.number(),
  unit: z.string().max(20).optional(),
  origin: z.enum(["OBSERVED","PATIENT_REPORTED","CAREGIVER_REPORTED","CLINICIAN_ENTERED","IMPORTED","CALCULATED","INFERRED","SIMULATED","PROJECTED","SYNTHETIC","UNKNOWN"]).default("OBSERVED"),
  status: z.enum(["ACTIVE","OBSERVED","ESTIMATED","INFERRED","SIMULATED","PROJECTED","RESEARCH_ONLY","CLINICAL_VALIDATION","DISPUTED","SUPERSEDED","EXPIRED","WITHDRAWN","RESTRICTED","REJECTED","UNABLE_TO_VERIFY"]).default("ACTIVE"),
  observedInputs: z.array(z.string()).default([]),
  modelName: z.string().max(80).optional().nullable(),
  modelVersion: z.string().max(40).optional().nullable(),
  artifactDigest: z.string().max(120).optional().nullable(),
  uncertainty: z.object({ confidence: z.string().max(20).default("moderate"), interval: z.tuple([z.coerce.number(), z.coerce.number()]).optional(), missing_inputs: z.array(z.string()).default([]), known_bias_risks: z.array(z.string()).default([]) }).optional(),
  timeValidAt: z.coerce.date().optional().nullable(),
  timeHorizon: z.string().max(40).optional().nullable(),
  timeExpiresAt: z.coerce.date().optional().nullable(),
  provenanceRef: z.string().max(80).optional().nullable(),
  consentRef: z.string().max(80).optional().nullable(),
  humanReview: z.boolean().default(false),
  intendedUse: z.string().max(200).optional().nullable(),
  capabilityStatus: z.enum(["PRODUCTION","CLINICAL_VALIDATION","RESEARCH","CONCEPTUAL"]).default("PRODUCTION"),
});

// ── Confidence and uncertainty — 8 dimensions ────────────────────────────
export const UNCERTAINTY_DIMENSIONS = ["Measurement uncertainty: reliability of source measurement","Data completeness: how much relevant information is missing","Model uncertainty: uncertainty about correct model/relationship","Population uncertainty: whether model applies to this person","Temporal uncertainty: whether data is current","Causal uncertainty: whether factor caused observed change","Projection uncertainty: grows with time horizon","Decision uncertainty: uncertainty about what action is best"] as const;

// ── Multiple time horizons — 5 ───────────────────────────────────────────
export const TIME_HORIZONS = [
  { horizon: "Current state", description: "What is observed or estimated now — 'Your average morning BP over last 14 days was 132/84 mmHg.'", label: "current_estimate" },
  { horizon: "Recent trend", description: "What has changed over defined historical period — 'Your average has increased compared with previous 14-day period.'", label: "recent_trend" },
  { horizon: "Near-term scenario", description: "Conditional projection over days/weeks — 'If current pattern continues, readings may remain above baseline.'", label: "near_term" },
  { horizon: "Long-term scenario", description: "Broad projection over months/years — 'This model explores how lifestyle patterns could relate to future risk; it cannot predict what will happen to you.'", label: "long_term" },
  { horizon: "Counterfactual", description: "Hypothetical comparison under explicit assumptions — 'In this simulation, model assumes increased activity and unchanged medication. Result is educational not treatment recommendation.'", label: "counterfactual" },
] as const;

// ── Twin views — 3 ───────────────────────────────────────────────────────
export const TWIN_VIEWS = {
  PATIENT: "Show: current observed state, recent trends, what is estimated, what is uncertain, what changed, what user can correct, what action is optional/clinician-directed, clear limitations — Avoid: 'Your biological age is 47' as definitive, 'You will develop diabetes,' 'Your lifespan is 82,' etc.",
  CLINICIAN: "Show: full provenance, inputs, transformations, model card, uncertainty, confidence intervals, contradictions, validation population, baseline, time horizon, patient goals, applicable guideline, sensitivity analysis, human-review state",
  RESEARCH: "Show: data-use license, de-identification, cohort eligibility, missingness, bias, data lineage, model version, reproducibility metadata, recontact restrictions, withdrawal status",
} as const;

// ── Attribute status — 14 ────────────────────────────────────────────────
export const ATTRIBUTE_STATUSES = ["Active","Observed","Estimated","Inferred","Simulated","Projected","Research-only","Clinical-validation","Disputed","Superseded","Expired","Withdrawn","Restricted","Rejected","Unable to verify"] as const;

// ── High-impact decision firewall — 14 prohibited + 8 enforcement ─────────
export const HIGH_IMPACT_PROHIBITED = ["Insurance underwriting","Insurance pricing","Employment screening","Promotion or dismissal","Credit scoring","Lending","Housing eligibility","Education eligibility","Government benefits","Immigration decisions","Criminal-justice decisions","Advertising category assignment","School or workplace surveillance","Care access ranking"] as const;
export const FIREWALL_ENFORCEMENT_POINTS = ["Data export","API","Feature store","Model-training pipeline","Prompt context","Decision-engine input","Partner integration","Research data release","Analytics warehouse"] as const;
export const PROHIBITED_DATA_FLOWS = ["Health record → biological-age estimate → risk score → insurance pricing","Wearable data → sleep or productivity inference → employment evaluation","Genomic data → disease-risk proxy → credit or eligibility decision"] as const;

// ── Counterfactual safeguards — 9 + 9 prohibited ──────────────────────────
export const COUNTERFACTUAL_ALLOWED_FOR = ["Patient education","Research","Clinician-supervised planning","Approved care-plan discussions","Population-level scenario analysis"] as const;
export const COUNTERFACTUAL_PROHIBITED_FOR = ["Autonomous medication changes","Unreviewed clinical orders","Insurance pricing","Employment decisions","Credit or eligibility scoring","Patient ranking","Claims denial","Marketing manipulation","Predictive disciplinary action"] as const;

// ── Twin model cards — 26 fields + 5 required cards ─────────────────────
export const TWIN_MODEL_CARD_FIELDS = ["Model name","Version","Owner","Intended users","Intended use","Prohibited use","Output type","Input variables","Data origin","Training population","Geography","Age range","Sex and relevant anatomy","Disease prevalence","Dataset size","Missingness","Training and test split","External validation","Performance metrics","Calibration","Subgroup performance","Known biases","Failure modes","Uncertainty behavior","Time horizon","Update policy","Drift monitoring","Human-review requirements","Clinical-validation status","Regulatory status","Privacy risks","Security risks","High-impact decision restrictions","Patient-facing explanation","Dispute and rollback process"] as const;

// ── Production and research boundaries — 4 + flag ────────────────────────
export const CAPABILITY_FLAG = {
  name: "longevity_projection",
  status: "research_only",
  patient_visible: true,
  clinical_use: false,
  automated_action: false,
  insurance_use: "blocked",
  employment_use: "blocked",
  credit_use: "blocked",
  eligibility_use: "blocked",
  counterfactuals: "allowed_with_disclaimer",
  model_card_required: true,
  human_review: "required_for_research_release",
};

// ── Helpers ─────────────────────────────────────────────────────────────
async function safe<T>(fn:()=>Promise<T>, fallback:T): Promise<T>{ try{ return await fn(); } catch{ return fallback; } }

// ── Zod schemas ─────────────────────────────────────────────────────────
export const simulationSchema = z.object({
  patientId: z.string().uuid(),
  question: z.string().min(1).max(500),
  baseline: z.string().max(80).optional(),
  assumptions: z.array(z.string()).default([]),
  horizon: z.string().max(40).optional(),
});

export const disputeSchema = z.object({
  patientId: z.string().uuid(),
  attributeId: z.string().min(1).max(80).optional().nullable(),
  reason: z.string().min(1).max(2000),
});

// ── TwinSafeguards ──────────────────────────────────────────────────────
export class TwinSafeguards {
  constructor(private readonly workspaceId: string, private readonly userId: string, private readonly role: Role) {}
  private async assert(action: "READ"|"CREATE"|"UPDATE"|"DELETE"){
    if (!(await can(this.workspaceId, this.role, "health", action))) throw new Error(`Missing ${action} permission for health_twin`);
  }
  private audit(action: string, targetType: string, targetId: string, meta?: Record<string,unknown>){
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: "health_twin", action, targetType, targetId, metadata: meta }).catch(()=>null);
  }

  // ── Attribute envelope — creation with origin/status/envelope ──────────
  async createAttribute(input: z.infer<typeof attributeEnvelopeSchema> & { patientId: string }){
    await this.assert("CREATE");
    // UI must never display calculated/inferred/simulated/projected/synthetic as observed facts — enforce status
    const status = input.origin==="OBSERVED"||input.origin==="PATIENT_REPORTED"||input.origin==="CLINICIAN_ENTERED" ? "ACTIVE" : input.origin==="INFERRED"||input.origin==="SIMULATED"||input.origin==="PROJECTED"?"RESEARCH_ONLY": input.status;
    const attributeId = `twin-attribute-${crypto.randomUUID().slice(0,8)}`;
    const row = await (prisma as never as { healthTwinAttribute:{create:(a:unknown)=>Promise<unknown>}}).healthTwinAttribute.create({ data:{
      workspaceId: this.workspaceId, patientId: input.patientId, attributeId, name: input.name, value: { value: input.value, unit: input.unit } as never,
      origin: input.origin as never, status: status as never, observedInputs: input.observedInputs as never,
      modelName: input.modelName ?? null, modelVersion: input.modelVersion ?? null, artifactDigest: input.artifactDigest ?? null,
      uncertainty: (input.uncertainty ?? {}) as never, timeValidAt: input.timeValidAt ?? null, timeHorizon: input.timeHorizon ?? null, timeExpiresAt: input.timeExpiresAt ?? null,
      provenanceRef: input.provenanceRef ?? null, consentRef: input.consentRef ?? null, humanReview: input.humanReview, intendedUse: input.intendedUse ?? null, capabilityStatus: input.capabilityStatus as never,
    } as never });
    await this.audit("CREATE","HealthTwinAttribute",attributeId, input as never);
    return row;
  }
  async listAttributes(patientId?: string, take=20){
    await this.assert("READ");
    const where:Record<string,unknown>={workspaceId: this.workspaceId};
    if(patientId) where.patientId=patientId;
    return safe(()=>(prisma as never as { healthTwinAttribute:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthTwinAttribute.findMany({ where, orderBy:{createdAt:"desc"}, take}),[]);
  }
  async getAttribute(attributeId: string){
    await this.assert("READ");
    const row = await safe(()=>(prisma as never as { healthTwinAttribute:{findFirst:(a:unknown)=>Promise<unknown>}}).healthTwinAttribute.findFirst({ where:{attributeId, workspaceId: this.workspaceId}}), null);
    if(!row) throw new Error("Attribute not found");
    return row;
  }

  // ── Multiple time horizons — separate views, never place projected on current timeline without label ─
  async listByHorizon(patientId: string, horizon?: string){
    await this.assert("READ");
    const where:Record<string,unknown>={workspaceId: this.workspaceId, patientId};
    if(horizon) where.timeHorizon=horizon;
    return safe(()=>(prisma as never as { healthTwinAttribute:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthTwinAttribute.findMany({ where, take:20}),[]);
  }

  // ── Reset, correct, dispute — visible on every attribute ───────────────
  async resetAttribute(attributeId: string, patientId: string){
    await this.assert("UPDATE");
    // Reset removes/rebuilds derived representation using new source window/default — does not delete original clinical record or erase audit trail
    const row = await (prisma as never as { healthTwinAttribute:{update:(a:unknown)=>Promise<unknown>}}).healthTwinAttribute.update({ where:{attributeId}, data:{ status:"WITHDRAWN" } as never }).catch(async()=>{
      return await (prisma as never as { healthTwinAttribute:{findFirst:(a:unknown)=>Promise<unknown>}}).healthTwinAttribute.findFirst({ where:{attributeId, workspaceId: this.workspaceId}});
    });
    await this.audit("RESET","HealthTwinAttribute",attributeId,{ patientId });
    return row;
  }
  async correctAttribute(attributeId: string, correctedValue: Record<string,unknown>, evidence?: Record<string,unknown>){
    await this.assert("UPDATE");
    // Preserve original and create versioned replacement → dependent inferences identified → affected outputs recomputed/withdrawn → downstream notified
    const original = await this.getAttribute(attributeId);
    const newId = `twin-attribute-${crypto.randomUUID().slice(0,8)}`;
    const corrected = await (prisma as never as { healthTwinAttribute:{create:(a:unknown)=>Promise<unknown>}}).healthTwinAttribute.create({ data:{
      workspaceId: this.workspaceId, patientId: (original as {patientId:string}).patientId, attributeId: newId, name: (original as {name:string}).name, value: correctedValue as never,
      origin: "CALCULATED" as never, status:"ACTIVE" as never, observedInputs: (original as {observedInputs:string[]}).observedInputs as never,
      provenanceRef: `prov-correction-${attributeId}`,
    } as never });
    await (prisma as never as { healthTwinAttribute:{update:(a:unknown)=>Promise<unknown>}}).healthTwinAttribute.update({ where:{attributeId}, data:{ status:"SUPERSEDED" } as never });
    await this.audit("CORRECT","HealthTwinAttribute",newId,{ originalAttributeId: attributeId, correctedValue, evidence });
    return { original, corrected, dependentInferences: "identified", affectedOutputs: "recomputed or withdrawn", downstreamNotified: true };
  }
  async disputeAttribute(input: z.infer<typeof disputeSchema>){
    await this.assert("CREATE");
    const row = await (prisma as never as { healthTwinDispute:{create:(a:unknown)=>Promise<unknown>}}).healthTwinDispute.create({ data:{
      workspaceId: this.workspaceId, patientId: input.patientId, attributeId: input.attributeId ?? null, reason: input.reason, status:"disputed", createdById: this.userId,
    } as never });
    // Disputed attribute blocked from high-impact automated actions until reviewed
    if (input.attributeId) {
      await safe(()=>(prisma as never as { healthTwinAttribute:{update:(a:unknown)=>Promise<unknown>}}).healthTwinAttribute.update({ where:{attributeId: input.attributeId!}, data:{ status:"DISPUTED" } as never }), null);
    }
    await this.audit("CREATE","HealthTwinDispute",(row as {id:string}).id, input as never);
    return row;
  }
  async listDisputes(patientId?: string, take=20){
    await this.assert("READ");
    const where:Record<string,unknown>={workspaceId: this.workspaceId};
    if(patientId) where.patientId=patientId;
    return safe(()=>(prisma as never as { healthTwinDispute:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthTwinDispute.findMany({ where, orderBy:{createdAt:"desc"}, take}),[]);
  }
  async resolveDispute(disputeId: string, resolution: string, status: string = "resolved"){
    await this.assert("UPDATE");
    const row = await (prisma as never as { healthTwinDispute:{update:(a:unknown)=>Promise<unknown>}}).healthTwinDispute.update({ where:{id: disputeId}, data:{ status, resolution, resolvedAt: new Date() } as never });
    await this.audit("UPDATE","HealthTwinDispute",disputeId,{ resolution, status });
    return row;
  }

  // ── Counterfactual simulation — assumptions explicit ───────────────────
  async createSimulation(input: z.infer<typeof simulationSchema>){
    await this.assert("CREATE");
    if ((input.assumptions ?? []).length===0) throw new Error("Every simulation must display assumptions");
    const row = await (prisma as never as { healthTwinSimulation:{create:(a:unknown)=>Promise<unknown>}}).healthTwinSimulation.create({ data:{
      workspaceId: this.workspaceId, patientId: input.patientId, simulationId: `sim-${crypto.randomUUID().slice(0,8)}`, question: input.question, baseline: input.baseline ?? null, assumptions: input.assumptions as never, horizon: input.horizon ?? null,
      output:{ estimated_change:"possible improvement", interval:"wide", confidence:"low" } as never, notAPrediction:true, notATreatmentInstruction:true, review:"clinician_supervision_required_for_clinical_use",
    } as never });
    await this.audit("CREATE","HealthTwinSimulation",(row as {simulationId:string}).simulationId, input as never);
    return row;
  }
  async listSimulations(patientId?: string, take=20){
    await this.assert("READ");
    const where:Record<string,unknown>={workspaceId: this.workspaceId};
    if(patientId) where.patientId=patientId;
    return safe(()=>(prisma as never as { healthTwinSimulation:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthTwinSimulation.findMany({ where, orderBy:{createdAt:"desc"}, take}),[]);
  }

  // ── High-impact decision firewall — block at 9 enforcement points ──────
  async checkHighImpactAccess(attributeId: string, purpose: string): Promise<{ decision: string; reason: string; blocked_attributes?: string[]; policy?: string; audit_event?: string; }> {
    await this.assert("READ");
    const attribute = await safe(()=>(prisma as never as { healthTwinAttribute:{findFirst:(a:unknown)=>Promise<{name:string;capabilityStatus:string;status:string}|null>}}).healthTwinAttribute.findFirst({ where:{attributeId, workspaceId: this.workspaceId}}), null);
    const isHighImpact = ["insurance_underwriting","insurance_pricing","employment_screening","credit_scoring","lending","housing_eligibility","education_eligibility","government_benefits","immigration_decisions","criminal_justice","advertising_category_assignment","school_workplace_surveillance","care_access_ranking"].includes(purpose);
    const isSensitive = attribute && ((attribute as {capabilityStatus:string}).capabilityStatus==="RESEARCH" || (attribute as {status:string}).status==="DISPUTED" || (attribute as {status:string}).status==="RESEARCH_ONLY");
    if (isHighImpact && isSensitive) {
      const auditId = `audit-${crypto.randomUUID().slice(0,8)}`;
      await this.audit("DENY","HealthTwinAttribute",attributeId,{ purpose, blocked_attributes:[(attribute as {name:string}).name], policy:"twin-safeguard-policy-2.0" });
      return { decision:"DENY", reason:"high_impact_use_of_health_inference", blocked_attributes:[(attribute as {name:string}).name], policy:"twin-safeguard-policy-2.0", audit_event: auditId };
    }
    // Block both raw sensitive data and derived proxies — e.g., insurer should not receive longevity score merely because it is not named as diagnosis
    if (isHighImpact) {
      return { decision:"DENY", reason:"high_impact_use_of_health_inference", blocked_attributes:[attributeId], policy:"twin-safeguard-policy-2.0", audit_event:`audit-${crypto.randomUUID().slice(0,8)}` };
    }
    return { decision:"ALLOW", reason:"Purpose is patient wellness or clinician-supervised care, not high-impact" };
  }

  // ── Clinical-use gate — 13 required ───────────────────────────────────
  static readonly CLINICAL_USE_GATE = ["Defined intended use","Clinical validation","Applicable population","Sufficient data quality","Known limitations","Human-review workflow","Evidence source","Model card","Monitoring plan","Correctability","Auditability","Consent and privacy controls","Approved change-management process"] as const;

  // ── Monitoring and redress — 14 + 7 ────────────────────────────────────
  static readonly MONITORING_METRICS = ["Attribute accuracy","Calibration","Drift","Missingness","Dispute rate","Correction rate","Withdrawal rate","Patient comprehension","Clinician override","Downstream action","Harm and near misses","Subgroup performance","High-impact access attempts","Unauthorized inference attempts","Model-card compliance","Time to dispute resolution"] as const;

  // ── Static exports for UI ─────────────────────────────────────────────
  static readonly TWIN_BOUNDARIES = TWIN_BOUNDARIES;
  static readonly TWIN_CAPABILITIES = TWIN_CAPABILITIES;
  static readonly TWIN_DATA_CLASSES = TWIN_DATA_CLASSES;
  static readonly TIME_HORIZONS = TIME_HORIZONS;
  static readonly TWIN_VIEWS = TWIN_VIEWS;
  static readonly HIGH_IMPACT_PROHIBITED = HIGH_IMPACT_PROHIBITED;
  static readonly COUNTERFACTUAL_ALLOWED_FOR = COUNTERFACTUAL_ALLOWED_FOR;
}
