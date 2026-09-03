// Medication Safety Cockpit — one reconciled, patient-confirmed medication picture across
// prescriptions, dispensing, claims, photographs, caregiver reports, and actual use.
// Purpose: detect discrepancies, explain risks, coordinate pharmacy + care teams, support
// affordability, and confirm changes with patient + authorized clinician.
// FHIR separation preserved: MedicationRequest (prescribed) vs MedicationDispense (supplied)
// vs MedicationStatement (reported) vs MedicationAdministration (given).
// Governing principle: never assume prescribed means taken, dispensed means understood,
// or detected means dangerous — reconcile, involve the right human, confirm with the patient.
import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "health_medication_safety";

// ── Architecture pipeline ───────────────────────────────────────────────
export const MEDICATION_PIPELINE = [
  "Identity, OCR, terminology, and provenance normalization",
  "Best Possible Medication History",
  "Reconciliation and discrepancy engine",
  "Medication and patient-context safety graph",
  "Pharmacist and clinician review",
  "Patient confirmation",
  "Updated medication plan",
  "Pharmacy, caregiver, and follow-up coordination",
  "Adverse-event and outcome tracking",
] as const;

// ── Four realities — never collapse ─────────────────────────────────────
export const FOUR_REALITIES = [
  "Prescribed: what a clinician ordered",
  "Dispensed: what a pharmacy supplied",
  "Reported: what the patient or caregiver says is being taken",
  "Administered: what was documented as actually given or taken",
] as const;

// ── BPMH source hierarchy — patient actual use first, no single source trusted ──
export const BPMH_SOURCES = [
  "Patient or caregiver confirmation",
  "Medication photographs",
  "Current clinician prescription",
  "Pharmacy dispensing feed",
  "Claims history",
  "Hospital medication administration record",
  "Previous reconciled list",
  "Specialist record",
  "Discharge medication list",
  "Patient portal entry",
  "External document",
  "Medication-device data",
] as const;

// ── Reconciliation states — meaning + action ────────────────────────────
export const RECONCILIATION_STATES = [
  "PRESCRIBED: clinician ordered → verify actual use",
  "DISPENSED: pharmacy supplied → do not assume ingestion",
  "PATIENT_REPORTED_CURRENT: patient says they use it → confirm details",
  "CAREGIVER_REPORTED: authorized caregiver reports use → patient or clinician confirmation",
  "ADMINISTERED: recorded as given or taken → link to date and source",
  "PATIENT_CONFIRMED_CURRENT: confirmed picture → active therapy",
  "PATIENT_STOPPED: patient reports discontinuation → confirm reason and clinician plan",
  "CLINICIAN_DISCONTINUED: order stopped → check current use and replacement",
  "UNCERTAIN: sources conflict → hold safety-sensitive guidance",
  "HISTORICAL: no longer current → preserve, exclude from active therapy",
  "DUPLICATE: same therapy multiple times → reconcile before action",
  "REFUSED: patient declines → document without coercion",
  "UNABLE_TO_OBTAIN: access problem → offer support or alternative",
  "UNKNOWN: insufficient information → request clarification",
] as const;

// ── Photograph reconciliation ───────────────────────────────────────────
export const PHOTO_SUBJECTS = [
  "Multiple medicines in one image",
  "Blister packs",
  "Bottles",
  "Handwritten labels",
  "Local brand names",
  "Combination products",
  "Different package sizes",
  "Expired or damaged packaging",
  "Non-prescription products",
  "Supplements and traditional medicines",
  "Duplicate photographs",
] as const;

export const PHOTO_PIPELINE = [
  "Photo captured",
  "Quality check",
  "OCR",
  "Label and barcode extraction",
  "Brand-to-ingredient matching",
  "Strength and dosage-form extraction",
  "Duplicate detection",
  "Patient confirmation",
  "Pharmacist review if uncertain",
  "Medication record update",
] as const;

// ── Pharmacy + claims feeds ─────────────────────────────────────────────
export const PHARMACY_FEED_FIELDS = [
  "Dispense date",
  "Quantity",
  "Days supply",
  "Refill count",
  "Pharmacy",
  "Product identifier",
  "Substitution",
  "Reversal",
  "Partial fill",
  "Prior authorization status",
] as const;

export const CLAIMS_GAPS = [
  "Cash purchase not visible in claims",
  "Samples",
  "Hospital supply",
  "Different pharmacy",
  "Early refill",
  "Stockpiling",
  "Medication discontinued but still appearing in claims",
  "Coverage loss",
  "Product substitution",
  "Patient assistance supply",
] as const;

// ── Patient confirmation — 12 questions + teach-back ────────────────────
export const CONFIRMATION_QUESTIONS = [
  "Are you taking this now?",
  "What strength do you take?",
  "How often do you take it?",
  "When did you last take it?",
  "Why do you take it?",
  "Did a clinician ask you to stop?",
  "Are you taking a different brand or strength?",
  "Do you take it only when needed?",
  "Are you having side effects?",
  "Are you using supplements or traditional medicines?",
  "Can you afford and obtain it?",
  "Does someone help you take it?",
] as const;

// ── Safety graph branches ───────────────────────────────────────────────
export const SAFETY_GRAPH = [
  "Kidney",
  "Liver",
  "Age",
  "Pregnancy",
  "Lactation",
  "Allergies",
  "Interactions",
  "Duplicate therapy",
  "Monitoring",
  "Affordability",
] as const;

export const RENAL_CHECKLIST = [
  "Latest kidney-function value",
  "Estimated filtration method",
  "Creatinine clearance where required",
  "Trend",
  "Dialysis status",
  "Dialysis timing",
  "Acute kidney injury possibility",
  "Drug clearance",
  "Dose and frequency",
  "Monitoring schedule",
  "Other nephrotoxic medicines",
] as const;

export const HEPATIC_CHECKLIST = [
  "Liver-function trend",
  "Bilirubin",
  "Albumin",
  "Coagulation status where relevant",
  "Documented cirrhosis or liver disease",
  "Hepatic impairment category",
  "Dose and titration",
  "Hepatotoxicity risk",
  "Alcohol or other exposure where clinically relevant",
  "Concurrent hepatotoxic medicines",
] as const;

export const HEPATIC_VERDICTS = [
  "No adjustment documented",
  "Adjustment may be needed",
  "Use requires caution",
  "Use not recommended in a defined condition",
  "Insufficient information",
] as const;

export const AGE_CHECKS = [
  "Pediatric dosing",
  "Older-adult pharmacokinetics",
  "Weight",
  "Renal function",
  "Falls",
  "Cognition",
  "Anticholinergic burden",
  "Sedation",
  "Orthostatic risk",
  "Polypharmacy",
  "Ability to administer medication",
  "Caregiver support",
] as const;

export const PREGNANCY_REVIEW = [
  "Gestational age",
  "Timing of exposure",
  "Maternal condition",
  "Alternative treatments",
  "Labeling and current clinical guidance",
  "Risk-benefit context",
] as const;

// ── Duplicate therapy — levels + resolutions ────────────────────────────
export const DUPLICATE_LEVELS = [
  "Same ingredient",
  "Same therapeutic class",
  "Same indication",
  "Same route",
  "Different brand names for the same drug",
  "Combination product plus one of its ingredients",
  "Temporary inpatient order that remained active",
  "Old and new dose both listed",
  "PRN and scheduled duplicate",
  "Duplicate supplements",
] as const;

export const DUPLICATE_RESOLUTIONS = [
  "Intentional combination",
  "Duplicate order",
  "Medication discontinued",
  "Patient not taking one item",
  "Short-term overlap",
  "Data error",
  "Requires review",
] as const;

// ── Deprescribing — candidates, never independent stops ─────────────────
export const DEPRESCRIBE_FACTORS = [
  "No documented indication",
  "Duplicate therapy",
  "Long-term use without review",
  "Risk greater than benefit in current context",
  "Falls or cognitive effects",
  "Kidney or liver change",
  "Treatment goal changed",
  "Preventive medication no longer appropriate",
  "Patient burden or affordability",
  "Repeated adverse effects",
  "Limited life expectancy or changed goals, where clinically appropriate",
  "Medication no longer aligned with care plan",
] as const;

// ── Taper / titration ───────────────────────────────────────────────────
export const TAPER_REQUIRED_FIELDS = [
  "Current dose",
  "Target dose",
  "Step size",
  "Interval",
  "Maximum or minimum limits",
  "Monitoring",
  "Pause rules",
  "Missed-step handling",
  "Symptoms requiring contact",
  "Clinician owner",
  "Patient confirmation",
  "Pharmacy coordination",
  "Automatic expiry",
] as const;

export const TITRATION_INPUTS = [
  "Clinician-approved protocol",
  "Validated measurement",
  "Defined target",
  "Maximum dose",
  "Minimum interval",
  "Contraindications",
  "Laboratory monitoring",
  "Patient symptoms",
  "Patient confirmation",
] as const;

export const TITRATION_WORKFLOW = [
  "Measurement due",
  "Quality check",
  "Confirm medication use",
  "Check contraindications",
  "Apply approved protocol",
  "Show proposed next step",
  "Patient confirmation",
  "Clinician or protocol authorization",
  "Pharmacy update",
  "Monitoring task",
] as const;

// ── Missed dose ─────────────────────────────────────────────────────────
export const MISSED_DOSE_INPUTS = [
  "Medicine and strength",
  "Scheduled time",
  "Time since scheduled dose",
  "Whether the dose was partly taken",
  "Whether vomiting occurred",
  "Next scheduled dose",
  "Medicine risk",
  "Prescribing instructions",
  "Patient symptoms",
  "Pregnancy or lactation where relevant",
  "Whether the medicine is controlled or time-critical",
] as const;

export const MISSED_DOSE_EVENTS = [
  "Missed",
  "Late",
  "Refused",
  "Vomited",
  "Unknown",
  "Could not obtain",
  "Device or reminder failure",
] as const;

// ── Affordability + alternatives ────────────────────────────────────────
export const AFFORDABILITY_FIELDS = [
  "Copayment",
  "Coverage",
  "Deductible",
  "Formulary status",
  "Prior authorization",
  "Quantity limits",
  "Pharmacy price",
  "Generic availability",
  "Patient assistance",
  "Local pharmacy access",
  "Transportation",
  "Stock availability",
  "Preferred pharmacy",
  "Language and support needs",
] as const;

export const ALTERNATIVE_WORKFLOW = [
  "Affordability barrier identified",
  "Confirm patient's cost concern",
  "Identify covered or lower-cost options",
  "Check clinical equivalence and contraindications",
  "Route alternatives to prescriber or pharmacist",
  "Clinician selects or rejects",
  "Patient confirms change",
  "Pharmacy receives updated prescription",
  "Follow-up verifies access",
] as const;

// ── Controlled substances ───────────────────────────────────────────────
export const CS_CHECKLIST = [
  "Patient location",
  "Prescriber jurisdiction",
  "Pharmacy jurisdiction",
  "Schedule or category",
  "Prescription validity",
  "Refill restrictions",
  "Quantity and days supply",
  "Multiple prescribers",
  "Multiple pharmacies",
  "Early refill",
  "Lost or stolen medication",
  "Urine or other monitoring where clinically required",
  "Consent and privacy",
  "Telehealth requirements",
  "Prescription-monitoring access",
  "State or national reporting rules",
] as const;

// ── Pharmacy coordination ───────────────────────────────────────────────
export const PHARMACY_WORKFLOWS = [
  "New prescription",
  "Renewal request",
  "Clarification",
  "Substitution request",
  "Availability issue",
  "Prior authorization",
  "Dose or strength mismatch",
  "Interaction question",
  "Refill synchronization",
  "Medication packaging",
  "Delivery",
  "Adherence support",
  "Adverse-event report",
  "Reconciliation request",
] as const;

export const PHARMACY_EXCHANGE_FIELDS = [
  "Sender",
  "Recipient",
  "Purpose",
  "Medication",
  "Patient authorization",
  "Status",
  "Response deadline",
  "Clinical owner",
  "Audit trail",
] as const;

// ── Caregiver coordination — task-specific, revocable ───────────────────
export const CAREGIVER_ALLOWED = [
  "View schedule",
  "Confirm administration",
  "Report missed or refused dose",
  "Record side effect",
  "Request refill",
  "View pharmacy status",
  "Receive approved reminders",
  "Upload medicine photograph",
  "Support a taper task",
] as const;

export const CAREGIVER_DENIED_DEFAULT = [
  "Change doses",
  "Stop medication",
  "View unrelated diagnoses",
  "View confidential pregnancy, mental-health, reproductive, or genomic information",
  "Receive controlled-substance risk flags",
  "Approve substitutions",
] as const;

// ── Adverse events ──────────────────────────────────────────────────────
export const ADVERSE_EVENT_FIELDS = [
  "Suspected medication",
  "Dose and route",
  "Start and stop dates",
  "Concomitant medicines",
  "Symptom or event",
  "Onset time",
  "Severity",
  "Outcome",
  "Hospitalization",
  "Relevant laboratory or imaging results",
  "Action taken",
  "Dechallenge or rechallenge",
  "Reporter",
  "Patient identifier",
  "Product or batch details where relevant",
] as const;

export const ADVERSE_EVENT_WORKFLOW = [
  "Patient or clinician reports symptom",
  "Link to medication and timing",
  "Assess severity and immediate safety",
  "Clinical review",
  "Treatment or medication action",
  "Document outcome",
  "Determine reporting requirement",
  "Submit to authorized safety system",
  "Track report identifier",
  "Monitor follow-up",
] as const;

// ── Alerts ──────────────────────────────────────────────────────────────
export const ALERT_CLASSES = [
  "critical_allergy_conflict",
  "serious_interaction",
  "duplicate_ingredient",
  "dose_out_of_range",
  "renal_adjustment_needed",
  "hepatic_concern",
  "pregnancy_concern",
  "lactation_concern",
  "monitoring_overdue",
  "taper_interruption",
  "high_risk_missed_dose",
  "controlled_substance_rule",
  "duplicate_prescription",
  "dispense_mismatch",
  "affordability_barrier",
  "adverse_event",
  "unable_to_obtain",
] as const;

export const ALERT_DISPLAY_FIELDS = [
  "Why it appeared",
  "Evidence",
  "Source",
  "Severity",
  "Confidence",
  "Recommended reviewer",
  "What is not known",
  "Whether the patient has been notified",
  "Whether action is blocked",
  "Whether a clinician has reviewed it",
] as const;

// ── Change confirmation workflow ────────────────────────────────────────
export const CHANGE_WORKFLOW = [
  "Proposed change",
  "Clinical authorization",
  "Reason documented",
  "Medication and safety checks",
  "Patient explanation",
  "Patient confirmation",
  "Pharmacy coordination",
  "Updated medication list",
  "Monitoring and follow-up",
] as const;

export const CONFIRMATION_RECORD_FIELDS = [
  "What changed",
  "Why it changed",
  "Start date",
  "Dose and route",
  "What was stopped",
  "What to do with remaining supply",
  "Expected effects",
  "Concerning symptoms",
  "Who to contact",
  "Patient understanding",
  "Patient acceptance, decline, or need for clarification",
] as const;

// ── Renewal protocol gates ──────────────────────────────────────────────
export const RENEWAL_PROTOCOL_GATES = [
  "Medication is active",
  "No safety conflict exists",
  "Required monitoring is current",
  "No concerning symptom or adverse reaction is present",
  "Prescription authority is valid",
  "Patient condition is stable under defined criteria",
] as const;

export const RENEWAL_CLINICIAN_REQUIRED = [
  "Dose change requested",
  "Monitoring overdue",
  "Allergy or interaction conflict",
  "New symptom",
  "Pregnancy status changed",
  "Kidney or liver function changed",
  "Controlled or high-risk medicine",
  "Medication list conflict",
  "Repeated early refill",
  "Patient cannot identify current dose",
] as const;

// ── FHIR mapping ────────────────────────────────────────────────────────
export const FHIR_MEDICATION_RESOURCES = [
  "MedicationRequest: prescription or administration instruction",
  "MedicationDispense: pharmacy dispensing event",
  "MedicationAdministration: medication actually administered",
  "MedicationStatement: patient, caregiver, or clinician report of use",
  "MedicationKnowledge: medication information and knowledge artifacts",
  "AllergyIntolerance: allergy and intolerance",
  "AdverseEvent: adverse-event record",
  "Observation: kidney, liver, pregnancy, lactation, and monitoring results",
  "Condition: relevant diseases",
  "CarePlan: tapering, titration, and monitoring plans",
  "Task: pharmacy, caregiver, reconciliation, and follow-up tasks",
  "Communication: patient and pharmacy messages",
  "Consent: caregiver, pharmacy, and data-sharing permissions",
  "Provenance: source and transformation history",
  "AuditEvent: access and medication-change audit",
] as const;

// ── Medication reconciliation API — 19 endpoints ─────────────────────────
export const MEDICATION_API = [
  "POST   /medications/photos",
  "POST   /medications/import/pharmacy",
  "POST   /medications/import/claims",
  "GET    /patients/{id}/medications/reconciliation",
  "POST   /medications/{id}/confirm",
  "POST   /medications/{id}/correct",
  "POST   /medications/{id}/dispute",
  "POST   /medications/{id}/start",
  "POST   /medications/{id}/stop",
  "POST   /medications/{id}/hold",
  "POST   /medications/{id}/renew",
  "POST   /medications/{id}/taper",
  "POST   /medications/{id}/titrate",
  "POST   /medications/{id}/missed-dose",
  "POST   /medications/{id}/adverse-event",
  "POST   /medications/{id}/affordability-review",
  "POST   /medications/{id}/pharmacy-message",
  "GET    /medications/safety-checks",
  "GET    /medications/controlled-substance-policy",
] as const;

// ── Helpers ─────────────────────────────────────────────────────────────
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

// ── Zod schemas ─────────────────────────────────────────────────────────
export const medRecordSchema = z.object({
  patientId: z.string().uuid(),
  canonicalName: z.string().min(1).max(200),
  ingredient: z.string().min(1).max(200),
  ingredients: z.array(z.string()).default([]),
  therapeuticClass: z.string().max(120).optional().nullable(),
  strength: z.string().max(60).optional().nullable(),
  form: z.string().max(60).optional().nullable(),
  route: z.string().max(60).optional().nullable(),
  directions: z.record(z.unknown()).optional(),
  status: z.enum(["PRESCRIBED","DISPENSED","PATIENT_REPORTED_CURRENT","CAREGIVER_REPORTED","ADMINISTERED","PATIENT_CONFIRMED_CURRENT","PATIENT_STOPPED","CLINICIAN_DISCONTINUED","UNCERTAIN","HISTORICAL","DUPLICATE","REFUSED","UNABLE_TO_OBTAIN","UNKNOWN"]).default("UNKNOWN"),
  indication: z.string().max(300).optional().nullable(),
  prescriber: z.string().max(120).optional().nullable(),
  pharmacy: z.string().max(120).optional().nullable(),
  missedDoseRule: z.string().max(1000).optional().nullable(),
  timeCritical: z.boolean().default(false),
  renalRisk: z.boolean().default(false),
  hepatotoxic: z.boolean().default(false),
  pregnancyRisk: z.boolean().default(false),
  controlledClass: z.string().max(60).optional().nullable(),
});

export const medPhotoSchema = z.object({
  patientId: z.string().uuid(),
  recordId: z.string().uuid().optional().nullable(),
  imageRef: z.string().min(1).max(500),
  ocr: z.record(z.unknown()).optional(),
  extracted: z.record(z.unknown()).optional(),
});

export const medImportSchema = z.object({
  patientId: z.string().uuid(),
  items: z.array(z.object({
    canonicalName: z.string().min(1).max(200),
    ingredient: z.string().min(1).max(200),
    ingredients: z.array(z.string()).default([]),
    strength: z.string().max(60).optional().nullable(),
    form: z.string().max(60).optional().nullable(),
    route: z.string().max(60).optional().nullable(),
    directions: z.record(z.unknown()).optional(),
    dispenseDate: z.coerce.date().optional().nullable(),
    quantity: z.coerce.number().optional().nullable(),
    daysSupply: z.coerce.number().optional().nullable(),
    pharmacy: z.string().max(120).optional().nullable(),
    productId: z.string().max(120).optional().nullable(),
    substitution: z.string().max(200).optional().nullable(),
    reversal: z.boolean().default(false),
    partialFill: z.boolean().default(false),
    priorAuth: z.string().max(60).optional().nullable(),
  })).min(1).max(100),
});

export const medConfirmSchema = z.object({
  answers: z.record(z.unknown()),
  teachBack: z.record(z.unknown()).optional(),
  confirmedBy: z.string().min(1).max(120),
});

export const medCorrectSchema = z.object({
  patch: z.record(z.unknown()),
  reason: z.string().min(1).max(500),
});

export const medDisputeSchema = z.object({
  reason: z.string().min(1).max(500),
  claimedStatus: z.string().max(60).optional().nullable(),
});

export const medChangeSchema = z.object({
  patientId: z.string().uuid(),
  recordId: z.string().uuid().optional().nullable(),
  changeType: z.enum(["start","stop","hold","renew","taper","titrate","dose_change","substitution"]),
  payload: z.record(z.unknown()).optional(),
  reason: z.string().min(1).max(1000).optional().nullable(),
});

export const medTaperSchema = z.object({
  recordId: z.string().uuid(),
  changeId: z.string().uuid().optional().nullable(),
  kind: z.enum(["TAPER","TITRATION"]).default("TAPER"),
  reason: z.string().min(1).max(1000).optional().nullable(),
  approvedBy: z.string().min(1).max(120),
  steps: z.array(z.record(z.unknown())).min(1).max(60),
  pauseRules: z.array(z.string()).default([]),
  contactRules: z.array(z.string()).default([]),
  expiresAt: z.coerce.date().optional().nullable(),
});

export const medTitrateSchema = z.object({
  recordId: z.string().uuid(),
  protocolRef: z.string().min(1).max(200),
  authorizedBy: z.string().min(1).max(120),
  measurement: z.record(z.unknown()),
  target: z.string().max(200).optional().nullable(),
  maxDose: z.string().max(100).optional().nullable(),
  patientConfirmed: z.boolean().default(false),
});

export const medMissedDoseSchema = z.object({
  recordId: z.string().uuid(),
  eventType: z.enum(["missed","late","refused","vomited","unknown","could_not_obtain","device_failure"]).default("missed"),
  scheduledAt: z.coerce.date().optional().nullable(),
  symptoms: z.string().max(500).optional().nullable(),
  pregnancyRelevant: z.boolean().default(false),
});

export const medAdverseEventSchema = z.object({
  patientId: z.string().uuid(),
  recordId: z.string().uuid().optional().nullable(),
  symptom: z.string().min(1).max(500),
  onsetAt: z.coerce.date().optional().nullable(),
  severity: z.enum(["MILD","MODERATE","SEVERE","LIFE_THREATENING"]).default("MODERATE"),
  outcome: z.string().max(500).optional().nullable(),
  hospitalized: z.boolean().default(false),
  actionTaken: z.string().max(500).optional().nullable(),
  reporter: z.string().max(120).optional().nullable(),
});

export const medAffordabilitySchema = z.object({
  recordId: z.string().uuid().optional().nullable(),
  barrier: z.record(z.unknown()),
});

export const medPharmacyMessageSchema = z.object({
  recordId: z.string().uuid().optional().nullable(),
  direction: z.enum(["TO_PHARMACY","FROM_PHARMACY"]),
  purpose: z.string().min(1).max(60),
  body: z.string().max(2000).optional().nullable(),
  patientAuthorized: z.boolean().default(false),
  responseDeadline: z.coerce.date().optional().nullable(),
});

export const medAllergySchema = z.object({
  patientId: z.string().uuid(),
  substance: z.string().min(1).max(200),
  reaction: z.string().max(500).optional().nullable(),
  severity: z.enum(["MILD","MODERATE","SEVERE"]).default("MODERATE"),
  source: z.string().max(200).optional().nullable(),
});

export const medCsPolicySchema = z.object({
  jurisdiction: z.string().min(1).max(80),
  medicineClass: z.string().min(1).max(120),
  rules: z.array(z.record(z.unknown())).default([]),
  source: z.string().max(300).optional().nullable(),
  effectiveDate: z.coerce.date().optional().nullable(),
  version: z.string().max(20).default("v1"),
});

// ═══════════════════════════════════════════════════════════════════════════
// MedicationSafetyCockpit — full implementation
// ═══════════════════════════════════════════════════════════════════════════

type PrismaMedRecord = {
  id: string; patientId: string; canonicalName: string; ingredient: string;
  ingredients: string[]; therapeuticClass: string | null; indication: string | null; status: string;
  strength: string | null; missedDoseRule: string | null; timeCritical: boolean;
  renalRisk: boolean; hepatotoxic: boolean; pregnancyRisk: boolean;
  controlledClass: string | null; sources: unknown; reconciliation: unknown; safetyContext: unknown;
};

export class MedicationSafetyCockpit {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, "health", action)))
      throw new Error(`Missing ${action} permission for health_medication_safety`);
  }

  private audit(action: string, targetType: string, targetId: string, meta?: Record<string, unknown>) {
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType, targetId, metadata: meta }).catch(() => null);
  }

  // ── Records ───────────────────────────────────────────────────────────
  async listRecords(patientId?: string, status?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (patientId) where.patientId = patientId;
    if (status) where.status = status;
    return safe(
      () => (prisma as never as { medicationRecord: { findMany: (a: unknown) => Promise<unknown[]> } })
        .medicationRecord.findMany({ where, orderBy: { updatedAt: "desc" }, take: 100 }),
      [],
    );
  }

  async getRecord(id: string) {
    await this.assert("READ");
    const row = await safe(
      () => (prisma as never as { medicationRecord: { findFirst: (a: unknown) => Promise<unknown> } })
        .medicationRecord.findFirst({ where: { id, workspaceId: this.workspaceId } }),
      null,
    );
    if (!row) throw new Error("Medication record not found");
    return row;
  }

  async createRecord(input: z.infer<typeof medRecordSchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { medicationRecord: { create: (a: unknown) => Promise<unknown> } })
      .medicationRecord.create({
        data: {
          workspaceId: this.workspaceId, patientId: input.patientId,
          canonicalName: input.canonicalName, ingredient: input.ingredient.toLowerCase(),
          ingredients: (input.ingredients.length > 0 ? input.ingredients : [input.ingredient]).map((s) => s.toLowerCase()) as never,
          therapeuticClass: input.therapeuticClass ?? null, strength: input.strength ?? null,
          form: input.form ?? null, route: input.route ?? null,
          directions: (input.directions ?? {}) as never, status: input.status as never,
          indication: input.indication ?? null, prescriber: input.prescriber ?? null,
          pharmacy: input.pharmacy ?? null, missedDoseRule: input.missedDoseRule ?? null,
          timeCritical: input.timeCritical, renalRisk: input.renalRisk,
          hepatotoxic: input.hepatotoxic, pregnancyRisk: input.pregnancyRisk,
          controlledClass: input.controlledClass ?? null, createdById: this.userId,
        } as never,
      });
    await this.audit("CREATE", "MedicationRecord", (row as { id: string }).id, input as never);
    return row;
  }

  private async appendSource(recordId: string, source: Record<string, unknown>) {
    const rec = await this.getRecord(recordId) as PrismaMedRecord;
    const sources = (Array.isArray(rec.sources) ? rec.sources : []) as Array<Record<string, unknown>>;
    await (prisma as never as { medicationRecord: { update: (a: unknown) => Promise<unknown> } })
      .medicationRecord.update({ where: { id: recordId }, data: { sources: [...sources, source] as never } as never });
  }

  // ── Pharmacy + claims import — dispense ≠ ingestion, claims = estimate ──
  async importPharmacy(input: z.infer<typeof medImportSchema>) {
    await this.assert("CREATE");
    const results: unknown[] = [];
    for (const item of input.items) {
      if (item.reversal) continue; // reversals void the dispense event, not the therapy
      const existing = await safe(
        () => (prisma as never as { medicationRecord: { findFirst: (a: unknown) => Promise<{ id: string } | null> } })
          .medicationRecord.findFirst({
            where: { workspaceId: this.workspaceId, patientId: input.patientId, ingredient: item.ingredient.toLowerCase(), status: { notIn: ["HISTORICAL", "CLINICIAN_DISCONTINUED", "DUPLICATE"] as never } },
          }),
        null,
      );
      const source = {
        type: "pharmacy_dispense", timestamp: (item.dispenseDate ?? new Date()).toISOString(),
        confidence: "moderate", pharmacy: item.pharmacy ?? null, quantity: item.quantity ?? null,
        daysSupply: item.daysSupply ?? null, productId: item.productId ?? null,
        substitution: item.substitution ?? null, partialFill: item.partialFill,
        priorAuth: item.priorAuth ?? null,
      };
      if (existing) {
        await this.appendSource(existing.id, source);
        results.push({ recordId: existing.id, linked: true });
      } else {
        const row = await this.createRecord({
          patientId: input.patientId, canonicalName: item.canonicalName, ingredient: item.ingredient,
          ingredients: item.ingredients, strength: item.strength ?? null, form: item.form ?? null,
          route: item.route ?? null, directions: item.directions ?? {}, status: "DISPENSED",
          pharmacy: item.pharmacy ?? null,
        } as z.infer<typeof medRecordSchema>);
        await this.appendSource((row as { id: string }).id, source);
        results.push({ recordId: (row as { id: string }).id, linked: false });
      }
    }
    await this.audit("IMPORT", "MedicationRecord", input.patientId, { source: "pharmacy", count: results.length });
    return { imported: results.length, results, note: "Dispensed means supplied — ingestion still requires patient confirmation" };
  }

  async importClaims(input: z.infer<typeof medImportSchema>) {
    await this.assert("CREATE");
    const res = await this.importPharmacy(input);
    await this.audit("IMPORT", "MedicationRecord", input.patientId, { source: "claims", count: res.imported });
    return {
      ...res,
      adherence: "estimate",
      gaps: CLAIMS_GAPS,
      note: "Claims suggest access or dispensing events but cannot confirm ingestion — adherence from claims is an estimate",
    };
  }

  // ── Photograph pipeline ───────────────────────────────────────────────
  async submitPhoto(input: z.infer<typeof medPhotoSchema>) {
    await this.assert("CREATE");
    const extracted = (input.extracted ?? {}) as Record<string, unknown>;
    const unclear = !extracted.ingredient || !extracted.strength;
    const row = await (prisma as never as { medicationPhoto: { create: (a: unknown) => Promise<unknown> } })
      .medicationPhoto.create({
        data: {
          workspaceId: this.workspaceId, patientId: input.patientId, recordId: input.recordId ?? null,
          imageRef: input.imageRef, ocr: (input.ocr ?? {}) as never, extracted: extracted as never,
          status: unclear ? "UNCLEAR" : "EXTRACTED", createdById: this.userId,
        } as never,
      });
    await this.audit("CREATE", "MedicationPhoto", (row as { id: string }).id, input as never);
    return {
      photo: row,
      message: unclear
        ? "Ani could not reliably identify the strength from this photograph. Please retake the image or confirm with your pharmacist."
        : "Extracted with per-field confidence — patient confirmation required before record update. Dose is never inferred from tablet color, shape, or appearance alone.",
    };
  }

  async linkPhoto(photoId: string, recordId: string, reviewerNote?: string) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { medicationPhoto: { update: (a: unknown) => Promise<unknown> } })
      .medicationPhoto.update({ where: { id: photoId }, data: { recordId, status: "LINKED", reviewerNote: reviewerNote ?? null } as never });
    await this.appendSource(recordId, { type: "photograph", ref: photoId, timestamp: new Date().toISOString(), confidence: "moderate" });
    await this.audit("LINK", "MedicationPhoto", photoId, { recordId });
    return row;
  }

  async listPhotos(patientId?: string, status?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (patientId) where.patientId = patientId;
    if (status) where.status = status;
    return safe(
      () => (prisma as never as { medicationPhoto: { findMany: (a: unknown) => Promise<unknown[]> } })
        .medicationPhoto.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
      [],
    );
  }

  // ── Reconciliation — BPMH view + discrepancies ────────────────────────
  async getReconciliation(patientId: string) {
    await this.assert("READ");
    const rows = await this.listRecords(patientId) as PrismaMedRecord[];
    const byReality = {
      prescribed: rows.filter((r) => r.status === "PRESCRIBED"),
      dispensed: rows.filter((r) => r.status === "DISPENSED"),
      reported: rows.filter((r) => ["PATIENT_REPORTED_CURRENT", "CAREGIVER_REPORTED", "PATIENT_CONFIRMED_CURRENT"].includes(r.status)),
      administered: rows.filter((r) => r.status === "ADMINISTERED"),
      uncertain: rows.filter((r) => r.status === "UNCERTAIN" || r.status === "UNKNOWN"),
      historical: rows.filter((r) => ["HISTORICAL", "CLINICIAN_DISCONTINUED", "PATIENT_STOPPED"].includes(r.status)),
    };
    const discrepancies: Array<Record<string, unknown>> = [];
    for (const r of rows) {
      if (r.status === "PRESCRIBED") discrepancies.push({ recordId: r.id, kind: "prescribed_not_confirmed", detail: `${r.canonicalName}: ordered but actual use unverified` });
      if (r.status === "DISPENSED") discrepancies.push({ recordId: r.id, kind: "dispensed_not_confirmed", detail: `${r.canonicalName}: supplied — ingestion not assumed` });
      if (r.status === "UNCERTAIN" || r.status === "UNKNOWN") discrepancies.push({ recordId: r.id, kind: "conflicting_sources", detail: `${r.canonicalName}: sources conflict — safety-sensitive guidance held` });
    }
    const dupes = this.findDuplicateGroups(rows);
    for (const g of dupes) discrepancies.push({ recordIds: g.recordIds, kind: "duplicate_therapy", detail: `${g.ingredient}: ${g.level}` });
    return {
      patientId, byReality,
      counts: { prescribed: byReality.prescribed.length, dispensed: byReality.dispensed.length, reported: byReality.reported.length, administered: byReality.administered.length, uncertain: byReality.uncertain.length },
      discrepancies, duplicates: dupes,
      states: RECONCILIATION_STATES,
      note: "Best history reflects actual use — patient confirmation + pharmacist/clinician review required for uncertain or high-risk medicines",
    };
  }

  private findDuplicateGroups(rows: PrismaMedRecord[]) {
    const live = rows.filter((r) => !["HISTORICAL", "CLINICIAN_DISCONTINUED", "PATIENT_STOPPED", "DUPLICATE"].includes(r.status));
    const byIngredient = new Map<string, PrismaMedRecord[]>();
    for (const r of live) {
      const keys = [r.ingredient, ...r.ingredients];
      for (const k of keys) {
        const list = byIngredient.get(k) ?? [];
        list.push(r);
        byIngredient.set(k, list);
      }
    }
    const groups: Array<{ ingredient: string; level: string; recordIds: string[] }> = [];
    for (const [ingredient, list] of byIngredient) {
      const unique = [...new Map(list.map((r) => [r.id, r])).values()];
      if (unique.length > 1) groups.push({ ingredient, level: "Same ingredient across multiple records", recordIds: unique.map((r) => r.id) });
    }
    return groups;
  }

  async detectDuplicates(patientId: string) {
    await this.assert("READ");
    const rows = await this.listRecords(patientId) as PrismaMedRecord[];
    return { patientId, groups: this.findDuplicateGroups(rows), levels: DUPLICATE_LEVELS, resolutions: DUPLICATE_RESOLUTIONS };
  }

  async resolveDuplicate(recordId: string, resolution: string, note?: string) {
    await this.assert("UPDATE");
    if (!DUPLICATE_RESOLUTIONS.includes(resolution as never)) throw new Error(`Resolution must be one of ${DUPLICATE_RESOLUTIONS.join(", ")}`);
    const row = await (prisma as never as { medicationRecord: { update: (a: unknown) => Promise<unknown> } })
      .medicationRecord.update({
        where: { id: recordId },
        data: { status: resolution === "Duplicate order" || resolution === "Data error" ? "DUPLICATE" : "UNCERTAIN", reconciliation: { duplicateResolution: resolution, note: note ?? null, at: new Date().toISOString() } as never } as never,
      });
    await this.audit("RESOLVE_DUPLICATE", "MedicationRecord", recordId, { resolution });
    return { record: row, warning: "Warning explains why it fired — intentional combinations documented, never silently merged" };
  }

  // ── Patient confirmation — timestamped, feed-proof ────────────────────
  async confirmMedication(recordId: string, input: z.infer<typeof medConfirmSchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { medicationConfirmation: { create: (a: unknown) => Promise<unknown> } })
      .medicationConfirmation.create({
        data: {
          workspaceId: this.workspaceId,
          patientId: (await this.getRecord(recordId) as PrismaMedRecord).patientId,
          recordId, answers: input.answers as never, teachBack: (input.teachBack ?? {}) as never,
          confirmedBy: input.confirmedBy,
        } as never,
      });
    const isCaregiver = input.confirmedBy.startsWith("caregiver:");
    await (prisma as never as { medicationRecord: { update: (a: unknown) => Promise<unknown> } })
      .medicationRecord.update({ where: { id: recordId }, data: { status: isCaregiver ? "CAREGIVER_REPORTED" : "PATIENT_CONFIRMED_CURRENT" } as never });
    await this.appendSource(recordId, { type: isCaregiver ? "caregiver_confirmation" : "patient_confirmation", ref: (row as { id: string }).id, timestamp: new Date().toISOString(), confidence: "high" });
    await this.audit("CONFIRM", "MedicationRecord", recordId, input as never);
    return { confirmation: row, questions: CONFIRMATION_QUESTIONS };
  }

  async correctMedication(recordId: string, input: z.infer<typeof medCorrectSchema>) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { medicationRecord: { update: (a: unknown) => Promise<unknown> } })
      .medicationRecord.update({ where: { id: recordId }, data: input.patch as never });
    await this.audit("CORRECT", "MedicationRecord", recordId, input as never);
    return row;
  }

  async disputeMedication(recordId: string, input: z.infer<typeof medDisputeSchema>) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { medicationRecord: { update: (a: unknown) => Promise<unknown> } })
      .medicationRecord.update({ where: { id: recordId }, data: { status: "UNCERTAIN" } as never });
    await this.audit("DISPUTE", "MedicationRecord", recordId, input as never);
    return { record: row, note: "Disputed items hold safety-sensitive guidance until reconciled" };
  }

  // ── Safety checks — flags for review, never auto dose-changes ─────────
  async runSafetyChecks(patientId: string, context?: { pregnancyStatus?: string; lactationStatus?: string; ageYears?: number }) {
    await this.assert("READ");
    const rows = await this.listRecords(patientId) as PrismaMedRecord[];
    const live = rows.filter((r) => ["PRESCRIBED","DISPENSED","PATIENT_REPORTED_CURRENT","CAREGIVER_REPORTED","ADMINISTERED","PATIENT_CONFIRMED_CURRENT"].includes(r.status));
    const allergies = await safe(
      () => (prisma as never as { medicationAllergy: { findMany: (a: unknown) => Promise<Array<{ substance: string; reaction: string | null; severity: string }>> } })
        .medicationAllergy.findMany({ where: { workspaceId: this.workspaceId, patientId, status: "ACTIVE" } }),
      [],
    );
    const labs = await safe(
      () => (prisma as never as { healthLabResult: { findMany: (a: unknown) => Promise<Array<{ testName: string; numericValue: number | null; abnormal: boolean; resultedAt: Date }>> } })
        .healthLabResult.findMany({ where: { workspaceId: this.workspaceId, patientId }, orderBy: { resultedAt: "desc" }, take: 30 }),
      [],
    );
    const renalLabs = labs.filter((l) => /egfr|creatinine/i.test(l.testName));
    const hepaticLabs = labs.filter((l) => /alt|ast|bilirubin|albumin|alkaline|alp\b/i.test(l.testName));
    const egfr = renalLabs.find((l) => /egfr/i.test(l.testName))?.numericValue ?? null;
    const created: unknown[] = [];
    const raise = async (recordId: string | null, alertClass: string, severity: "CRITICAL"|"HIGH"|"MODERATE"|"LOW", why: string, evidence: unknown[], confidence = "moderate") => {
      const dup = await safe(
        () => (prisma as never as { medicationAlert: { findFirst: (a: unknown) => Promise<{ id: string } | null> } })
          .medicationAlert.findFirst({ where: { workspaceId: this.workspaceId, patientId, alertClass, recordId, status: "OPEN" } }),
        null,
      );
      if (dup) return dup;
      const row = await (prisma as never as { medicationAlert: { create: (a: unknown) => Promise<unknown> } })
        .medicationAlert.create({
          data: {
            workspaceId: this.workspaceId, patientId, recordId, alertClass, severity: severity as never,
            why, evidence: evidence as never, source: "medication_safety_cockpit", confidence,
          } as never,
        });
      created.push(row);
      return row;
    };
    // Allergy conflicts — ingredient or class substring match
    for (const r of live) {
      for (const a of allergies) {
        if (r.ingredient.includes(a.substance) || a.substance.includes(r.ingredient) || r.ingredients.some((i) => i.includes(a.substance) || a.substance.includes(i))) {
          await raise(r.id, "critical_allergy_conflict", "CRITICAL", `${r.canonicalName} conflicts with documented allergy to ${a.substance} (${a.reaction ?? "reaction unknown"})`, [{ allergy: a, record: r.canonicalName }], "high");
        }
      }
    }
    // Duplicate ingredients
    for (const g of this.findDuplicateGroups(live)) {
      await raise(null, "duplicate_ingredient", "HIGH", `Same ingredient '${g.ingredient}' across ${g.recordIds.length} records`, [{ recordIds: g.recordIds }], "high");
    }
    // Renal — current appropriate data, method identified
    const renalAtRisk = live.filter((r) => r.renalRisk);
    if (renalAtRisk.length > 0) {
      const method = renalLabs.length > 0 ? renalLabs[0]!.testName : "no recent kidney-function result";
      if (egfr !== null && egfr < 60) {
        for (const r of renalAtRisk) await raise(r.id, "renal_adjustment_needed", "HIGH", `${r.canonicalName}: eGFR ${egfr} may affect use — flagged for pharmacist/clinician review; do not change the dose yourself`, [{ egfr, method, medicines: renalAtRisk.map((x) => x.canonicalName) }], "moderate");
      } else if (egfr === null) {
        for (const r of renalAtRisk) await raise(r.id, "renal_adjustment_needed", "MODERATE", `${r.canonicalName} requires renal review but kidney function is unknown (${method})`, [{ method }], "low");
      }
    }
    // Hepatic — trend, never single-test diagnosis
    const hepAtRisk = live.filter((r) => r.hepatotoxic);
    if (hepAtRisk.length > 0) {
      const abnormalTrend = hepaticLabs.filter((l) => l.abnormal);
      if (abnormalTrend.length >= 2) {
        for (const r of hepAtRisk) await raise(r.id, "hepatic_concern", "HIGH", `${r.canonicalName}: repeated abnormal liver tests — use requires caution, clinician review`, [{ labs: abnormalTrend.slice(0, 4).map((l) => ({ test: l.testName, value: l.numericValue, at: l.resultedAt })) }], "moderate");
      } else if (hepaticLabs.length === 0) {
        for (const r of hepAtRisk) await raise(r.id, "hepatic_concern", "MODERATE", `${r.canonicalName}: hepatotoxicity risk with no recent liver data — insufficient information`, [{}], "low");
      }
    }
    // Pregnancy / lactation — context only, never inferred from meds
    if (context?.pregnancyStatus === "confirmed") {
      for (const r of live.filter((r) => r.pregnancyRisk)) {
        await raise(r.id, "pregnancy_concern", "HIGH", `${r.canonicalName} needs pregnancy review (gestational age, exposure timing, alternatives, risk-benefit). Contact prescriber/pharmacist before starting, stopping, or changing it.`, [{ review: PREGNANCY_REVIEW }], "moderate");
      }
    }
    if (context?.pregnancyStatus === "unknown") {
      for (const r of live.filter((r) => r.pregnancyRisk)) {
        await raise(r.id, "pregnancy_concern", "MODERATE", `${r.canonicalName}: pregnancy status unknown — recheck when clinically relevant; status is patient-confirmed, time-stamped, purpose-limited`, [{}], "low");
      }
    }
    // Monitoring overdue — no confirmation in 180 days
    const cutoff = Date.now() - 180 * 86_400_000;
    const confirmations = await safe(
      () => (prisma as never as { medicationConfirmation: { findMany: (a: unknown) => Promise<Array<{ recordId: string; confirmedAt: Date }>> } })
        .medicationConfirmation.findMany({ where: { workspaceId: this.workspaceId, patientId } }),
      [],
    );
    const lastConfirm = new Map<string, number>();
    for (const c of confirmations) lastConfirm.set(c.recordId, Math.max(lastConfirm.get(c.recordId) ?? 0, new Date(c.confirmedAt).getTime()));
    for (const r of live) {
      if ((lastConfirm.get(r.id) ?? 0) < cutoff) {
        await raise(r.id, "monitoring_overdue", "MODERATE", `${r.canonicalName}: no patient confirmation in 180 days`, [{}], "low");
      }
    }
    return {
      patientId, evaluated: live.length,
      renal: { method: renalLabs.length > 0 ? renalLabs[0]!.testName : "none", egfr, checklist: RENAL_CHECKLIST },
      hepatic: { results: hepaticLabs.length, abnormalTrend: hepaticLabs.filter((l) => l.abnormal).length, checklist: HEPATIC_CHECKLIST, verdicts: HEPATIC_VERDICTS },
      ageChecks: AGE_CHECKS,
      raised: created.length,
      note: "Flags route to pharmacist/clinician — dose changes require authorized approval. Single abnormal liver test is never converted into liver failure; age alone is never a frailty proxy.",
    };
  }

  async listAlerts(patientId?: string, status?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (patientId) where.patientId = patientId;
    if (status) where.status = status;
    return safe(
      () => (prisma as never as { medicationAlert: { findMany: (a: unknown) => Promise<unknown[]> } })
        .medicationAlert.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
      [],
    );
  }

  async reviewAlert(id: string, decision: "ACKNOWLEDGED"|"RESOLVED"|"DISMISSED_WITH_REASON", reviewer: string, note?: string) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { medicationAlert: { update: (a: unknown) => Promise<unknown> } })
      .medicationAlert.update({ where: { id }, data: { status: decision, reviewer, reviewedAt: new Date(), why: note ?? undefined } as never });
    await this.audit("REVIEW", "MedicationAlert", id, { decision, reviewer });
    return { alert: row, display: ALERT_DISPLAY_FIELDS };
  }

  // ── Deprescribing opportunities — review only ─────────────────────────
  async deprescribingReview(patientId: string) {
    await this.assert("READ");
    const rows = await this.listRecords(patientId) as PrismaMedRecord[];
    const live = rows.filter((r) => ["PATIENT_CONFIRMED_CURRENT","PATIENT_REPORTED_CURRENT","DISPENSED","PRESCRIBED"].includes(r.status));
    const candidates = live
      .filter((r) => !r.indication || r.indication === "documented_or_unknown" || r.indication === "unknown")
      .map((r) => ({
        recordId: r.id, medication: r.canonicalName,
        text: `Potential medication-review opportunity: ${r.canonicalName} is active but its indication is not documented. Please review whether continuation, dose reduction, substitution, or tapering is appropriate.`,
        factors: DEPRESCRIBE_FACTORS,
      }));
    return {
      patientId, candidates,
      safeguards: "Never imply discontinuation is safe — show indication uncertainty, risks/benefits, withdrawal risk, route to clinician/pharmacist, ask patient goals, record final decision",
    };
  }

  // ── Change workflow ───────────────────────────────────────────────────
  async proposeChange(input: z.infer<typeof medChangeSchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { medicationChange: { create: (a: unknown) => Promise<unknown> } })
      .medicationChange.create({
        data: {
          workspaceId: this.workspaceId, patientId: input.patientId, recordId: input.recordId ?? null,
          changeType: input.changeType, payload: (input.payload ?? {}) as never,
          reason: input.reason ?? null, createdById: this.userId,
        } as never,
      });
    await this.audit("PROPOSE", "MedicationChange", (row as { id: string }).id, input as never);
    return { change: row, workflow: CHANGE_WORKFLOW };
  }

  async authorizeChange(id: string, authorizedBy: string) {
    await this.assert("UPDATE");
    const change = await this.getChange(id) as { patientId: string };
    const safety = await this.runSafetyChecks(change.patientId);
    const row = await (prisma as never as { medicationChange: { update: (a: unknown) => Promise<unknown> } })
      .medicationChange.update({ where: { id }, data: { status: "SAFETY_CHECKED", authorizedBy, safetyCheck: { raised: safety.raised, at: new Date().toISOString() } as never } as never });
    await this.audit("AUTHORIZE", "MedicationChange", id, { authorizedBy });
    return { change: row, safety };
  }

  async explainChange(id: string, explanation: string) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { medicationChange: { update: (a: unknown) => Promise<unknown> } })
      .medicationChange.update({ where: { id }, data: { status: "EXPLAINED", patientExplanation: explanation } as never });
    await this.audit("EXPLAIN", "MedicationChange", id, {});
    return row;
  }

  async confirmChange(id: string, confirmation: Record<string, unknown>) {
    await this.assert("UPDATE");
    const decision = (confirmation.accepted as string) ?? "accepted";
    const row = await (prisma as never as { medicationChange: { update: (a: unknown) => Promise<unknown> } })
      .medicationChange.update({
        where: { id },
        data: {
          status: decision === "declined" ? "DECLINED" : decision === "needs_clarification" ? "EXPLAINED" : "PATIENT_CONFIRMED",
          patientConfirmation: { ...confirmation, at: new Date().toISOString() } as never,
        } as never,
      });
    await this.audit("CONFIRM", "MedicationChange", id, confirmation);
    return { change: row, fields: CONFIRMATION_RECORD_FIELDS };
  }

  async sendToPharmacy(id: string) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { medicationChange: { update: (a: unknown) => Promise<unknown> } })
      .medicationChange.update({ where: { id }, data: { status: "PHARMACY_SENT", pharmacyStatus: "SENT" } as never });
    await this.audit("SEND_PHARMACY", "MedicationChange", id, {});
    return row;
  }

  async activateChange(id: string) {
    await this.assert("UPDATE");
    const change = await this.getChange(id) as { recordId: string | null; changeType: string; payload: Record<string, unknown> };
    const row = await (prisma as never as { medicationChange: { update: (a: unknown) => Promise<unknown> } })
      .medicationChange.update({ where: { id }, data: { status: "ACTIVE" } as never });
    if (change.recordId) {
      const nextStatus = change.changeType === "stop" ? "CLINICIAN_DISCONTINUED" : change.changeType === "hold" ? "UNCERTAIN" : "PATIENT_CONFIRMED_CURRENT";
      await (prisma as never as { medicationRecord: { update: (a: unknown) => Promise<unknown> } })
        .medicationRecord.update({ where: { id: change.recordId }, data: { status: nextStatus, ...(change.payload ?? {}) } as never });
    }
    await this.audit("ACTIVATE", "MedicationChange", id, {});
    return row;
  }

  async markUnconfirmed(id: string, reason: string) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { medicationChange: { update: (a: unknown) => Promise<unknown> } })
      .medicationChange.update({ where: { id }, data: { status: "UNCONFIRMED" } as never });
    await this.audit("UNCONFIRMED", "MedicationChange", id, { reason });
    return { change: row, note: "Unconfirmed changes are routed to the care team with human follow-up scheduled — never presented as active" };
  }

  async getChange(id: string) {
    await this.assert("READ");
    const row = await safe(
      () => (prisma as never as { medicationChange: { findFirst: (a: unknown) => Promise<unknown> } })
        .medicationChange.findFirst({ where: { id, workspaceId: this.workspaceId } }),
      null,
    );
    if (!row) throw new Error("Medication change not found");
    return row;
  }

  async listChanges(patientId?: string, status?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (patientId) where.patientId = patientId;
    if (status) where.status = status;
    return safe(
      () => (prisma as never as { medicationChange: { findMany: (a: unknown) => Promise<unknown[]> } })
        .medicationChange.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
      [],
    );
  }

  // ── Renewals — protocol gates, never silent new prescriptions ─────────
  async renewMedication(recordId: string, requestedBy: string) {
    await this.assert("CREATE");
    const rec = await this.getRecord(recordId) as PrismaMedRecord;
    const blocks: string[] = [];
    if (!["PATIENT_CONFIRMED_CURRENT","PATIENT_REPORTED_CURRENT","DISPENSED","PRESCRIBED"].includes(rec.status)) blocks.push("Medication is not active");
    if (rec.controlledClass) blocks.push("Controlled or high-risk medicine — clinician review required");
    const openAlerts = await safe(
      () => (prisma as never as { medicationAlert: { findMany: (a: unknown) => Promise<Array<{ alertClass: string }>> } })
        .medicationAlert.findMany({ where: { workspaceId: this.workspaceId, recordId, status: "OPEN" } }),
      [],
    );
    if (openAlerts.length > 0) blocks.push(`${openAlerts.length} open safety alert(s)`);
    const change = await this.proposeChange({ patientId: rec.patientId, recordId, changeType: "renew", reason: `Renewal requested by ${requestedBy}` });
    return {
      ...change, protocolEligible: blocks.length === 0, blocks,
      gates: RENEWAL_PROTOCOL_GATES, clinicianRequired: RENEWAL_CLINICIAN_REQUIRED,
      note: "A renewal queue must never silently convert a refill request into a new prescription",
    };
  }

  // ── Tapers — authorized, versioned, monitored, expiring ───────────────
  async createTaper(patientId: string, input: z.infer<typeof medTaperSchema>) {
    await this.assert("CREATE");
    if (!input.approvedBy) throw new Error("Taper requires clinician authorization — never generate from general information");
    const row = await (prisma as never as { medicationTaper: { create: (a: unknown) => Promise<unknown> } })
      .medicationTaper.create({
        data: {
          workspaceId: this.workspaceId, patientId, recordId: input.recordId, changeId: input.changeId ?? null,
          kind: input.kind, reason: input.reason ?? null, approvedBy: input.approvedBy,
          steps: input.steps as never, pauseRules: input.pauseRules, contactRules: input.contactRules,
          expiresAt: input.expiresAt ?? null, createdById: this.userId,
        } as never,
      });
    await this.audit("CREATE", "MedicationTaper", (row as { id: string }).id, input as never);
    return { taper: row, required: TAPER_REQUIRED_FIELDS };
  }

  async activateTaper(id: string) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { medicationTaper: { update: (a: unknown) => Promise<unknown> } })
      .medicationTaper.update({ where: { id }, data: { status: "ACTIVE" } as never });
    await this.audit("ACTIVATE", "MedicationTaper", id, {});
    return row;
  }

  async confirmTaper(id: string, confirmed: boolean) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { medicationTaper: { update: (a: unknown) => Promise<unknown> } })
      .medicationTaper.update({ where: { id }, data: { patientConfirmed: confirmed } as never });
    await this.audit("CONFIRM", "MedicationTaper", id, { confirmed });
    return row;
  }

  async listTapers(patientId?: string, status?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (patientId) where.patientId = patientId;
    if (status) where.status = status;
    const rows = await safe(
      () => (prisma as never as { medicationTaper: { findMany: (a: unknown) => Promise<Array<{ id: string; expiresAt: Date | null; status: string }>> } })
        .medicationTaper.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
      [],
    );
    // Automatic expiry
    for (const t of rows) {
      if (t.expiresAt && new Date(t.expiresAt).getTime() < Date.now() && (t.status === "ACTIVE" || t.status === "DRAFT")) {
        await safe(
          () => (prisma as never as { medicationTaper: { update: (a: unknown) => Promise<unknown> } })
            .medicationTaper.update({ where: { id: t.id }, data: { status: "EXPIRED" } as never }),
          null,
        );
        t.status = "EXPIRED";
      }
    }
    return rows;
  }

  // ── Titration — protocol + authorization, never AI-trend-only ─────────
  async titrate(input: z.infer<typeof medTitrateSchema>) {
    await this.assert("CREATE");
    if (!input.protocolRef || !input.authorizedBy) throw new Error("Titration requires a clinician-approved protocol and authorization");
    if (!input.patientConfirmed) throw new Error("Titration step requires patient confirmation");
    const rec = await this.getRecord(input.recordId) as PrismaMedRecord;
    const change = await this.proposeChange({ patientId: rec.patientId, recordId: rec.id, changeType: "titrate", payload: { protocolRef: input.protocolRef, measurement: input.measurement, target: input.target ?? null, maxDose: input.maxDose ?? null }, reason: `Protocol ${input.protocolRef}` });
    await this.authorizeChange((change.change as { id: string }).id, input.authorizedBy);
    return { ...change, workflow: TITRATION_WORKFLOW, inputs: TITRATION_INPUTS, note: "A patient is never told to change a dose solely because a model detected a trend" };
  }

  // ── Missed dose — medicine-specific, never default to doubling ────────
  async missedDoseGuidance(input: z.infer<typeof medMissedDoseSchema>) {
    await this.assert("READ");
    const rec = await this.getRecord(input.recordId) as PrismaMedRecord;
    if (input.eventType === "vomited" || input.eventType === "unknown" || !rec.missedDoseRule) {
      return {
        recordId: rec.id, eventType: input.eventType,
        guidance: "Do not guess or double the next dose. Check the medication label, contact your pharmacist, or follow your clinician's written plan.",
        source: "safe_fallback", escalate: rec.timeCritical || !!rec.controlledClass,
      };
    }
    return {
      recordId: rec.id, eventType: input.eventType,
      guidance: rec.missedDoseRule, source: "medicine_specific_rule",
      escalate: rec.timeCritical || !!rec.controlledClass || (input.symptoms ? true : false),
      inputs: MISSED_DOSE_INPUTS,
    };
  }

  // ── Affordability — options routed, never self-substitution ───────────
  async startAffordabilityReview(patientId: string, input: z.infer<typeof medAffordabilitySchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { affordabilityReview: { create: (a: unknown) => Promise<unknown> } })
      .affordabilityReview.create({
        data: {
          workspaceId: this.workspaceId, patientId, recordId: input.recordId ?? null,
          barrier: input.barrier as never, createdById: this.userId,
        } as never,
      });
    await this.audit("CREATE", "AffordabilityReview", (row as { id: string }).id, input as never);
    return { review: row, fields: AFFORDABILITY_FIELDS, workflow: ALTERNATIVE_WORKFLOW };
  }

  async decideAffordability(id: string, options: Array<Record<string, unknown>>, selectedBy: string) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { affordabilityReview: { update: (a: unknown) => Promise<unknown> } })
      .affordabilityReview.update({ where: { id }, data: { options: options as never, selectedBy, status: "DECIDED" } as never });
    await this.audit("DECIDE", "AffordabilityReview", id, { selectedBy });
    return { review: row, note: "Lower price never justifies switching without pharmacist/clinician review of equivalence and contraindications" };
  }

  async confirmAffordability(id: string) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { affordabilityReview: { update: (a: unknown) => Promise<unknown> } })
      .affordabilityReview.update({ where: { id }, data: { patientConfirmed: true, status: "CONFIRMED" } as never });
    await this.audit("CONFIRM", "AffordabilityReview", id, {});
    return { review: row, wording: "Your plan may cover another medicine at lower cost. This is an option for your prescriber or pharmacist to review; do not substitute it yourself." };
  }

  async listAffordability(patientId?: string, status?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (patientId) where.patientId = patientId;
    if (status) where.status = status;
    return safe(
      () => (prisma as never as { affordabilityReview: { findMany: (a: unknown) => Promise<unknown[]> } })
        .affordabilityReview.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
      [],
    );
  }

  // ── Pharmacy coordination ─────────────────────────────────────────────
  async sendPharmacyMessage(patientId: string, input: z.infer<typeof medPharmacyMessageSchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { pharmacyMessage: { create: (a: unknown) => Promise<unknown> } })
      .pharmacyMessage.create({
        data: {
          workspaceId: this.workspaceId, patientId, recordId: input.recordId ?? null,
          direction: input.direction, purpose: input.purpose, body: input.body ?? null,
          patientAuthorized: input.patientAuthorized, responseDeadline: input.responseDeadline ?? null,
          owner: this.userId, createdById: this.userId,
        } as never,
      });
    await this.audit("CREATE", "PharmacyMessage", (row as { id: string }).id, input as never);
    return { message: row, workflows: PHARMACY_WORKFLOWS, exchange: PHARMACY_EXCHANGE_FIELDS };
  }

  async acknowledgePharmacyMessage(id: string) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { pharmacyMessage: { update: (a: unknown) => Promise<unknown> } })
      .pharmacyMessage.update({ where: { id }, data: { status: "ACKNOWLEDGED" } as never });
    await this.audit("ACK", "PharmacyMessage", id, {});
    return row;
  }

  async listPharmacyMessages(patientId?: string, status?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (patientId) where.patientId = patientId;
    if (status) where.status = status;
    return safe(
      () => (prisma as never as { pharmacyMessage: { findMany: (a: unknown) => Promise<unknown[]> } })
        .pharmacyMessage.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
      [],
    );
  }

  // ── Adverse events — causality never required to report ───────────────
  async reportAdverseEvent(input: z.infer<typeof medAdverseEventSchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { medicationAdverseEvent: { create: (a: unknown) => Promise<unknown> } })
      .medicationAdverseEvent.create({
        data: {
          workspaceId: this.workspaceId, patientId: input.patientId, recordId: input.recordId ?? null,
          symptom: input.symptom, onsetAt: input.onsetAt ?? null, severity: input.severity,
          outcome: input.outcome ?? null, hospitalized: input.hospitalized,
          actionTaken: input.actionTaken ?? null, reporter: input.reporter ?? null,
          createdById: this.userId,
        } as never,
      });
    await this.audit("REPORT", "MedicationAdverseEvent", (row as { id: string }).id, input as never);
    return { event: row, workflow: ADVERSE_EVENT_WORKFLOW, fields: ADVERSE_EVENT_FIELDS };
  }

  async submitAdverseEvent(id: string, systemRef: string) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { medicationAdverseEvent: { update: (a: unknown) => Promise<unknown> } })
      .medicationAdverseEvent.update({ where: { id }, data: { reportStatus: "SUBMITTED", reportId: systemRef } as never });
    await this.audit("SUBMIT", "MedicationAdverseEvent", id, { systemRef });
    return { event: row, note: "Proof of causality is not required to report a suspected problem — uncertainty preserved" };
  }

  async listAdverseEvents(patientId?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (patientId) where.patientId = patientId;
    return safe(
      () => (prisma as never as { medicationAdverseEvent: { findMany: (a: unknown) => Promise<unknown[]> } })
        .medicationAdverseEvent.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
      [],
    );
  }

  // ── Allergies ─────────────────────────────────────────────────────────
  async addAllergy(input: z.infer<typeof medAllergySchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { medicationAllergy: { create: (a: unknown) => Promise<unknown> } })
      .medicationAllergy.create({
        data: {
          workspaceId: this.workspaceId, patientId: input.patientId,
          substance: input.substance.toLowerCase(), reaction: input.reaction ?? null,
          severity: input.severity, source: input.source ?? null, createdById: this.userId,
        } as never,
      });
    await this.audit("CREATE", "MedicationAllergy", (row as { id: string }).id, input as never);
    return row;
  }

  async listAllergies(patientId: string) {
    await this.assert("READ");
    return safe(
      () => (prisma as never as { medicationAllergy: { findMany: (a: unknown) => Promise<unknown[]> } })
        .medicationAllergy.findMany({ where: { workspaceId: this.workspaceId, patientId }, orderBy: { createdAt: "desc" }, take: 50 }),
      [],
    );
  }

  // ── Controlled substances — jurisdiction registry, data not verdicts ──
  async upsertControlledPolicy(input: z.infer<typeof medCsPolicySchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { controlledSubstancePolicy: { upsert: (a: unknown) => Promise<unknown> } })
      .controlledSubstancePolicy.upsert({
        where: { workspaceId_jurisdiction_medicineClass_version: { workspaceId: this.workspaceId, jurisdiction: input.jurisdiction, medicineClass: input.medicineClass, version: input.version } },
        create: {
          workspaceId: this.workspaceId, jurisdiction: input.jurisdiction, medicineClass: input.medicineClass,
          rules: input.rules as never, source: input.source ?? null,
          effectiveDate: input.effectiveDate ?? null, reviewedAt: new Date(), owner: "pharmacy_compliance", version: input.version,
        } as never,
        update: { rules: input.rules as never, source: input.source ?? null, effectiveDate: input.effectiveDate ?? null, reviewedAt: new Date(), active: true } as never,
      });
    await this.audit("UPSERT", "ControlledSubstancePolicy", (row as { id: string }).id, input as never);
    return row;
  }

  async getControlledPolicy(jurisdiction?: string, medicineClass?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId, active: true };
    if (jurisdiction) where.jurisdiction = jurisdiction;
    if (medicineClass) where.medicineClass = medicineClass;
    return safe(
      () => (prisma as never as { controlledSubstancePolicy: { findMany: (a: unknown) => Promise<unknown[]> } })
        .controlledSubstancePolicy.findMany({ where, orderBy: { createdAt: "desc" }, take: 20 }),
      [],
    );
  }

  async checkControlled(recordId: string, context: { prescriberCount?: number; pharmacyCount?: number; earlyRefill?: boolean }) {
    await this.assert("READ");
    const rec = await this.getRecord(recordId) as PrismaMedRecord;
    const policies = await this.getControlledPolicy(undefined, rec.controlledClass ?? undefined);
    return {
      recordId, controlledClass: rec.controlledClass, policies,
      signals: context, checklist: CS_CHECKLIST,
      note: "Never infer misuse from a single early refill or multiple-pharmacy event — present data for authorized review; distinguish access problems, travel, stock, dose changes, and transitions from possible misuse",
    };
  }

  // ── Cockpit summary ───────────────────────────────────────────────────
  async cockpitSummary(patientId: string) {
    await this.assert("READ");
    const recon = await this.getReconciliation(patientId);
    const alerts = await this.listAlerts(patientId, "OPEN") as Array<{ severity: string }>;
    const changes = await this.listChanges(patientId) as Array<{ status: string }>;
    const tapers = await this.listTapers(patientId) as Array<{ status: string }>;
    const affordability = await this.listAffordability(patientId, "OPEN");
    const bySeverity: Record<string, number> = { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0 };
    for (const a of alerts) bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;
    return {
      patientId,
      realities: recon.counts,
      uncertain: recon.byReality.uncertain.length,
      discrepancies: recon.discrepancies.length,
      alertsOpen: alerts.length, alertsBySeverity: bySeverity,
      changesPending: changes.filter((c) => !["ACTIVE","CANCELLED","DECLINED","SUPERSEDED"].includes(c.status)).length,
      tapersActive: tapers.filter((t) => t.status === "ACTIVE").length,
      affordabilityOpen: (affordability as unknown[]).length,
      caregiver: { allowed: CAREGIVER_ALLOWED, deniedByDefault: CAREGIVER_DENIED_DEFAULT },
    };
  }

  // ── Static exports for UI ─────────────────────────────────────────────
  static readonly MEDICATION_PIPELINE = MEDICATION_PIPELINE;
  static readonly FOUR_REALITIES = FOUR_REALITIES;
  static readonly BPMH_SOURCES = BPMH_SOURCES;
  static readonly MEDICATION_API = MEDICATION_API;
  static readonly FHIR_MEDICATION_RESOURCES = FHIR_MEDICATION_RESOURCES;
  static readonly ALERT_CLASSES = ALERT_CLASSES;
}
