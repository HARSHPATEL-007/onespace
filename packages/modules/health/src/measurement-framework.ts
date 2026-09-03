// N0VA HEALTH & WELLNESS Measurement Framework — Project Vita.
// Measurable product and clinical outcomes per edition, plus claim
// validation. Broad claims ("neural optimization", "quantum health", bare
// accuracy percentages) are never product guarantees unless backed by a
// defined validation protocol, population, comparator, confidence interval,
// and regulatory status.
//
// Governing principle: every capability earns its claims with evidence —
// numerator, denominator, population, baseline, and uncertainty shown.
import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import crypto from "node:crypto";

const MODULE = "health_outcomes";
export const MEASUREMENT_FRAMEWORK_VERSION = "2026.09";

// ── Outcome measures — 20 product and clinical outcomes ───────────────
export const OUTCOME_MEASURES = [
  { id: "patient_activation", name: "Patient activation", definition: "Share of patients reaching adequate activation (PAM-13 level 3+) or equivalent engagement index", method: "rate", direction: "increase", editions: ["NOVA_PERSONAL", "NOVA_CARE"], dataSources: ["app_engagement", "surveys"], subgroupRequired: true },
  { id: "patient_engagement", name: "Patient engagement", definition: "Returning active users completing at least one health action per period", method: "rate", direction: "increase", editions: ["NOVA_PERSONAL", "NOVA_CARE"], dataSources: ["app_engagement"], subgroupRequired: true },
  { id: "medication_adherence", name: "Medication adherence", definition: "Share of patients with proportion of days covered (PDC) at or above 80%", method: "rate", direction: "increase", editions: ["NOVA_PERSONAL", "NOVA_CARE", "NOVA_CLINICAL"], dataSources: ["pharmacy_claims", "device_dispensers", "self_report"], subgroupRequired: true },
  { id: "abnormal_result_review_time", name: "Time to review abnormal results", definition: "Median minutes from abnormal result availability to qualified review", method: "median_minutes", direction: "decrease", editions: ["NOVA_CARE", "NOVA_CLINICAL"], dataSources: ["lab_feed", "work_queue"], subgroupRequired: false },
  { id: "referral_completion", name: "Referral completion", definition: "Share of referrals reaching closed-loop completion (appointment kept + report returned)", method: "rate", direction: "increase", editions: ["NOVA_CARE", "NOVA_CLINICAL"], dataSources: ["referral_lifecycle"], subgroupRequired: true },
  { id: "no_show_rate", name: "No-show rate", definition: "Share of scheduled encounters ending in no-show; tracked as reduction vs baseline", method: "rate", direction: "decrease", editions: ["NOVA_CARE", "NOVA_CLINICAL"], dataSources: ["scheduling"], subgroupRequired: true },
  { id: "readmission_30d", name: "30-day readmission", definition: "Risk-adjusted share of discharges followed by unplanned readmission within 30 days", method: "rate_risk_adjusted", direction: "decrease", editions: ["NOVA_CLINICAL"], dataSources: ["adt_feed", "claims"], subgroupRequired: true },
  { id: "alert_false_positive_rate", name: "Alert false-positive rate", definition: "Share of fired alerts without clinical action or event, per alert type and version", method: "rate", direction: "decrease", editions: ["NOVA_CARE", "NOVA_CLINICAL"], dataSources: ["alert_intelligence"], subgroupRequired: false },
  { id: "alert_false_negative_rate", name: "Alert false-negative rate", definition: "Share of clinical events the alert logic should have caught but did not, per alert type", method: "rate", direction: "decrease", editions: ["NOVA_CARE", "NOVA_CLINICAL"], dataSources: ["chart_review", "safety_incidents"], subgroupRequired: false },
  { id: "alert_ack_time", name: "Alert acknowledgement time", definition: "Median minutes from alert firing to named-owner acknowledgement", method: "median_minutes", direction: "decrease", editions: ["NOVA_CARE", "NOVA_CLINICAL"], dataSources: ["alert_intelligence", "work_queue"], subgroupRequired: false },
  { id: "documentation_time_saved", name: "Clinician documentation time saved", definition: "Mean minutes saved per encounter vs pre-AI baseline, same specialty and visit mix", method: "mean_minutes", direction: "increase", editions: ["NOVA_CARE", "NOVA_CLINICAL"], dataSources: ["time_motion", "ehr_audit"], subgroupRequired: false },
  { id: "patient_comprehension", name: "Patient comprehension", definition: "Share of teach-back sessions passed on first or second attempt", method: "rate", direction: "increase", editions: ["NOVA_PERSONAL", "NOVA_CARE"], dataSources: ["literacy_module"], subgroupRequired: true },
  { id: "model_calibration", name: "Model calibration", definition: "Calibration error and slope per model version on the deployed population", method: "score", direction: "decrease", editions: ["NOVA_CLINICAL", "NOVA_RESEARCH"], dataSources: ["model_registry"], subgroupRequired: true },
  { id: "subgroup_performance", name: "Performance by demographic subgroup", definition: "Max performance gap across reported subgroups for safety-critical models and measures", method: "gap", direction: "decrease", editions: ["NOVA_CLINICAL", "NOVA_RESEARCH", "NOVA_PUBLIC_HEALTH"], dataSources: ["model_registry", "stratified_measures"], subgroupRequired: true },
  { id: "sync_success_rate", name: "Data synchronization success rate", definition: "Share of scheduled FHIR/HL7/DICOM sync transactions applied or reconciled", method: "rate", direction: "increase", editions: ["NOVA_CARE", "NOVA_CLINICAL"], dataSources: ["interop_control_plane"], subgroupRequired: false },
  { id: "signal_quality_rate", name: "Device signal-quality rate", definition: "Share of device readings passing the signal-quality threshold for clinical use", method: "rate", direction: "increase", editions: ["NOVA_PERSONAL", "NOVA_CARE", "NOVA_CLINICAL"], dataSources: ["device_registry", "provenance"], subgroupRequired: false },
  { id: "consent_fulfillment_time", name: "Consent fulfillment time", definition: "Median minutes from consent or data request to fulfillment or documented denial", method: "median_minutes", direction: "decrease", editions: ["NOVA_PERSONAL", "NOVA_CARE", "NOVA_RESEARCH"], dataSources: ["wallet", "research_governance"], subgroupRequired: false },
  { id: "incident_response_time", name: "Security incident response time", definition: "Median minutes from incident detection to containment or compensating control", method: "median_minutes", direction: "decrease", editions: ["NOVA_CARE", "NOVA_CLINICAL", "NOVA_PUBLIC_HEALTH"], dataSources: ["cyber_resilience"], subgroupRequired: false },
  { id: "availability_by_tier", name: "System availability by clinical tier", definition: "Uptime percentage per clinical tier against tier objectives (life-safety strictest)", method: "uptime_percent", direction: "increase", editions: ["NOVA_CARE", "NOVA_CLINICAL", "NOVA_PUBLIC_HEALTH"], dataSources: ["resilience_monitors"], subgroupRequired: false },
  { id: "cost_per_monitored_patient", name: "Cost per monitored patient", definition: "Fully loaded platform cost per actively monitored patient per period", method: "cost", direction: "decrease", editions: ["NOVA_CARE", "NOVA_CLINICAL", "NOVA_RESEARCH"], dataSources: ["finance", "enrollment"], subgroupRequired: false },
  { id: "clinical_outcome_improvement", name: "Clinical outcome improvement", definition: "Risk-adjusted improvement on a pre-registered condition outcome vs baseline", method: "rate_risk_adjusted", direction: "increase", editions: ["NOVA_CARE", "NOVA_CLINICAL", "NOVA_PUBLIC_HEALTH"], dataSources: ["quality_program"], subgroupRequired: true },
] as const;
export type OutcomeMeasureId = (typeof OUTCOME_MEASURES)[number]["id"];

// ── Claim validation — evidence before guarantees ─────────────────────
export const BANNED_CLAIM_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /neural\s+optim/i, label: "neural optimization" },
  { pattern: /quantum\s+(health|healing|optimi)/i, label: "quantum health" },
  { pattern: /\b\d{2,3}(\.\d+)?\s*%\s*(accura|precis|efficac|sensitiv|specific)/i, label: "bare accuracy percentage" },
];

export const claimReviewSchema = z.object({
  claimText: z.string().min(1).max(2000),
  context: z.string().default(""),
  validationProtocol: z.string().default(""),
  population: z.string().default(""),
  comparator: z.string().default(""),
  confidenceInterval: z.string().default(""),
  regulatoryStatus: z.string().default(""),
  reviewer: z.string().default(""),
});

export function validateClaim(input: z.infer<typeof claimReviewSchema>): { permitted: boolean; flags: string[]; requirements: string[] } {
  const parsed = claimReviewSchema.parse(input);
  const flags: string[] = [];
  for (const b of BANNED_CLAIM_PATTERNS) {
    if (b.pattern.test(parsed.claimText)) flags.push(`Unbacked claim language: "${b.label}"`);
  }
  const makesQuantitativeClaim = /\b\d{2,3}(\.\d+)?\s*%|\bAUC\b|\bC-index\b|\b\d+\s*x\s+(better|faster)|\bhalv|\beliminat/i.test(parsed.claimText);
  const requirements: string[] = [];
  if (flags.length > 0 || makesQuantitativeClaim) {
    const missing: Array<[string, string]> = [
      [parsed.validationProtocol, "validation protocol"],
      [parsed.population, "validation population"],
      [parsed.comparator, "comparator"],
      [parsed.confidenceInterval, "confidence interval"],
      [parsed.regulatoryStatus, "regulatory status"],
    ];
    for (const [v, name] of missing) if (!v) requirements.push(name);
  }
  return { permitted: requirements.length === 0, flags, requirements };
}

// ── Measurements ──────────────────────────────────────────────────────
export const measurementSchema = z.object({
  measureId: z.string().min(1),
  edition: z.enum(["NOVA_PERSONAL", "NOVA_CARE", "NOVA_CLINICAL", "NOVA_RESEARCH", "NOVA_PUBLIC_HEALTH"]).optional(),
  numerator: z.coerce.number().optional(),
  denominator: z.coerce.number().optional(),
  value: z.coerce.number(),
  unit: z.string().default(""),
  stratum: z.record(z.unknown()).default({}),
  riskAdjusted: z.boolean().default(false),
  ciLower: z.coerce.number().optional().nullable(),
  ciUpper: z.coerce.number().optional().nullable(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  dataCompleteness: z.coerce.number().min(0).max(1).default(1),
  caveats: z.string().default(""),
});

// ── In-memory fallbacks (pre-migration) ───────────────────────────────
interface StoredRow extends Record<string, unknown> { id: string; workspaceId: string }
const memMeasurements = new Map<string, StoredRow[]>();
const memClaims = new Map<string, StoredRow[]>();

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}
function memList(m: Map<string, StoredRow[]>, ws: string): StoredRow[] { return m.get(ws) ?? []; }
function memPush(m: Map<string, StoredRow[]>, ws: string, row: StoredRow) { m.set(ws, [...(m.get(ws) ?? []), row]); }

type OutcomeTables = {
  healthOutcomeMeasurement: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
  healthClaimReview: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
};

// ── Outcome Assurance Control ─────────────────────────────────────────
export class OutcomeAssurance {
  constructor(private readonly workspaceId: string, private readonly userId: string, private readonly role: Role) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, "health", action))) throw new Error(`Missing ${action} permission for health`);
  }
  private audit(action: string, targetId: string, meta?: Record<string, unknown>) {
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType: "OutcomeArtifact", targetId, metadata: meta }).catch(() => null);
  }

  listMeasures(edition?: string) {
    const all = [...OUTCOME_MEASURES];
    return edition ? all.filter((m) => (m.editions as readonly string[]).includes(edition)) : all;
  }

  async recordMeasurement(input: z.infer<typeof measurementSchema>) {
    await this.assert("CREATE");
    const parsed = measurementSchema.parse(input);
    const known = (OUTCOME_MEASURES as readonly { id: string }[]).some((m) => m.id === parsed.measureId);
    if (!known) throw new Error(`Unknown outcome measure: ${parsed.measureId}`);
    if (parsed.denominator !== undefined && parsed.denominator <= 0) throw new Error("Denominator must be positive when provided");
    const id = `m-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as OutcomeTables).healthOutcomeMeasurement.create({
        data: {
          workspaceId: this.workspaceId, measurementId: id, measureId: parsed.measureId,
          edition: parsed.edition ?? "", numerator: parsed.numerator ?? null,
          denominator: parsed.denominator ?? null, value: parsed.value, unit: parsed.unit,
          stratum: parsed.stratum, riskAdjusted: parsed.riskAdjusted,
          ciLower: parsed.ciLower ?? null, ciUpper: parsed.ciUpper ?? null,
          periodStart: parsed.periodStart ?? null, periodEnd: parsed.periodEnd ?? null,
          dataCompleteness: parsed.dataCompleteness, caveats: parsed.caveats,
          createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    if (!row) memPush(memMeasurements, this.workspaceId, stored);
    await this.audit("outcomes.measurement.recorded", id, { measure: parsed.measureId, value: parsed.value });
    return (row as unknown) ?? stored;
  }

  async listMeasurements(measureId?: string, edition?: string) {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as unknown as OutcomeTables).healthOutcomeMeasurement.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 200 }) as Promise<never[]>,
      [],
    );
    let all = rows.length ? (rows as Array<Record<string, unknown>>) : memList(memMeasurements, this.workspaceId);
    if (measureId) all = all.filter((r) => r.measureId === measureId);
    if (edition) all = all.filter((r) => r.edition === edition);
    return all;
  }

  async reviewClaim(input: z.infer<typeof claimReviewSchema>) {
    await this.assert("CREATE");
    const parsed = claimReviewSchema.parse(input);
    const verdict = validateClaim(parsed);
    const id = `claim-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as OutcomeTables).healthClaimReview.create({
        data: {
          workspaceId: this.workspaceId, claimId: id, claimText: parsed.claimText,
          context: parsed.context, validationProtocol: parsed.validationProtocol,
          population: parsed.population, comparator: parsed.comparator,
          confidenceInterval: parsed.confidenceInterval, regulatoryStatus: parsed.regulatoryStatus,
          permitted: verdict.permitted, flags: verdict.flags,
          reviewer: parsed.reviewer, createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>), ...verdict };
    if (!row) memPush(memClaims, this.workspaceId, stored);
    await this.audit("outcomes.claim.reviewed", id, { permitted: verdict.permitted, flags: verdict.flags.length });
    return { claimId: id, ...verdict, ...((row as unknown as Record<string, unknown> | null) ?? {}) };
  }

  async listClaimReviews(permittedOnly?: boolean) {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as unknown as OutcomeTables).healthClaimReview.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 200 }) as Promise<never[]>,
      [],
    );
    const all = rows.length ? (rows as Array<Record<string, unknown>>) : memList(memClaims, this.workspaceId);
    return permittedOnly ? all.filter((r) => r.permitted === true) : all;
  }

  async dashboard(edition?: string) {
    await this.assert("READ");
    const [measures, readings, claims] = await Promise.all([
      Promise.resolve(this.listMeasures(edition)),
      this.listMeasurements(undefined, edition),
      this.listClaimReviews(),
    ]);
    const latest: Record<string, unknown> = {};
    for (const r of readings as Array<Record<string, unknown>>) {
      if (r.measureId && !(r.measureId as string in latest)) latest[r.measureId as string] = r;
    }
    return {
      version: MEASUREMENT_FRAMEWORK_VERSION,
      measures: measures.length,
      readings: (readings as unknown[]).length,
      measured: Object.keys(latest).length,
      unmeasured: measures.filter((m) => !(m.id in latest)).map((m) => m.id),
      blockedClaims: (claims as Array<Record<string, unknown>>).filter((c) => c.permitted === false).length,
      generatedAt: new Date().toISOString(),
    };
  }
}

// ── Static reference exports ──────────────────────────────────────────
export const OUTCOME_API = [
  "listMeasures", "recordMeasurement", "listMeasurements",
  "reviewClaim", "listClaimReviews", "dashboard",
] as const;
