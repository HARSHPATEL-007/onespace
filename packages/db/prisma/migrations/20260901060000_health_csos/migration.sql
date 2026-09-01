-- Clinical Safety Operating System — mandatory control plane
-- FDA CDS independent review, WHO autonomy/safety/transparency/accountability, NIST AI RMF govern-map-measure-manage
-- No model may approve its own output, modify threshold, bypass review, or directly execute S4-S5

-- CreateEnum
CREATE TYPE "SafetyClass" AS ENUM ('S0', 'S1', 'S2', 'S3', 'S4', 'S5');

-- CreateEnum
CREATE TYPE "SafetyActionKind" AS ENUM ('OBSERVE', 'SUGGEST', 'DRAFT', 'REQUEST_APPROVAL', 'EXECUTE');

-- CreateEnum
CREATE TYPE "RecommendationState" AS ENUM ('GENERATED', 'VALIDATING', 'ELIGIBLE', 'REVIEW_REQUIRED', 'APPROVED', 'EXECUTING', 'COMPLETED', 'OUTCOME_MONITORED', 'ABSTAINED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'SUPERSEDED', 'FAILED_SAFE');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('REVIEWED', 'AGREED', 'MODIFIED', 'OVERRIDDEN', 'REJECTED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "ReviewLevel" AS ENUM ('SINGLE', 'DUAL', 'SPECIALIST', 'EMERGENCY_CONCURRENCE', 'PATIENT_CONFIRMATION');

-- CreateEnum
CREATE TYPE "SafetyIncidentKind" AS ENUM ('FALSE_NEGATIVE', 'FALSE_POSITIVE', 'DELAYED_ALERT', 'WRONG_PATIENT', 'UNSAFE_RECOMMENDATION', 'MISSING_CONTRAINDICATION', 'HALLUCINATED_EVIDENCE', 'INCORRECT_DOSE', 'ALERT_FATIGUE', 'UNAUTHORIZED_DISCLOSURE', 'WRONG_RECIPIENT', 'DEVICE_DATA_CORRUPTION', 'MODEL_DRIFT', 'AUTOMATION_BIAS', 'WORKFLOW_COLLISION', 'FAILED_ESCALATION', 'INCORRECT_EMERGENCY_LOCATION', 'PARTIAL_TRANSACTION', 'CLINICIAN_OVERRIDE', 'PATIENT_HARM', 'NEAR_MISS', 'OTHER');

-- CreateEnum
CREATE TYPE "SafetyIncidentSeverity" AS ENUM ('NEGLIGIBLE', 'MINOR', 'MODERATE', 'MAJOR', 'CATASTROPHIC');

-- CreateEnum
CREATE TYPE "SafetyIncidentStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'CORRECTIVE_ACTION', 'PREVENTIVE_ACTION', 'REGULATORY_REVIEW', 'CLOSED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "SafetyCaseStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'CONDITIONAL', 'REJECTED', 'RETIRED');

-- CreateEnum
CREATE TYPE "EnvelopeStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'RETIRED');

-- CreateTable
CREATE TABLE "HealthModelRegistry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "safetyClass" "SafetyClass" NOT NULL,
    "approvedUse" TEXT NOT NULL,
    "excludedUse" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredInputs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxInputAgeMin" INTEGER,
    "minSignalQuality" DOUBLE PRECISION,
    "minCalibration" DOUBLE PRECISION,
    "requiredRole" TEXT,
    "executionMode" TEXT NOT NULL DEFAULT 'recommendation_only',
    "regulatoryStatus" TEXT NOT NULL DEFAULT 'research',
    "validationPop" JSONB NOT NULL DEFAULT '{}',
    "localMetrics" JSONB NOT NULL DEFAULT '{}',
    "driftStatus" TEXT NOT NULL DEFAULT 'nominal',
    "status" "EnvelopeStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthModelRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthOperatingEnvelope" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "envelope" JSONB NOT NULL,
    "status" "EnvelopeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthOperatingEnvelope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthSafetyPolicy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "policyKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "riskClass" "SafetyClass" NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "controls" JSONB NOT NULL DEFAULT '{}',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthSafetyPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthSafetyRecommendation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT,
    "encounterId" TEXT,
    "modelId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "policyVersion" TEXT,
    "safetyClass" "SafetyClass" NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "intendedUse" TEXT NOT NULL DEFAULT '',
    "state" "RecommendationState" NOT NULL DEFAULT 'GENERATED',
    "priority" TEXT NOT NULL DEFAULT 'routine',
    "requiredReviewerRole" TEXT,
    "reviewLevel" "ReviewLevel" NOT NULL DEFAULT 'SINGLE',
    "urgency" TEXT,
    "inputSnapshot" JSONB NOT NULL DEFAULT '{}',
    "inputSnapshotHash" TEXT,
    "dataSources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dataFreshness" JSONB NOT NULL DEFAULT '{}',
    "missingInputs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contradictions" JSONB NOT NULL DEFAULT '[]',
    "signalQuality" DOUBLE PRECISION,
    "probability" DOUBLE PRECISION,
    "calibrationStatus" TEXT,
    "aleatoricUncert" DOUBLE PRECISION,
    "epistemicUncert" DOUBLE PRECISION,
    "inputQualityConf" DOUBLE PRECISION,
    "populationConf" DOUBLE PRECISION,
    "temporalStability" DOUBLE PRECISION,
    "driftStatus" TEXT,
    "evidenceStrength" TEXT,
    "actionability" TEXT,
    "confidenceInterval" JSONB,
    "evidencePanel" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB NOT NULL DEFAULT '{}',
    "explainability" JSONB NOT NULL DEFAULT '{}',
    "authorizedActions" "SafetyActionKind"[] DEFAULT ARRAY[]::"SafetyActionKind"[],
    "blockedActions" "SafetyActionKind"[] DEFAULT ARRAY[]::"SafetyActionKind"[],
    "linkedTaskId" TEXT,
    "linkedOrderId" TEXT,
    "linkedAlertId" TEXT,
    "linkedMessageId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "supersededById" TEXT,
    "traceId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "stateChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcomeStatus" TEXT,
    "outcomeAt" TIMESTAMP(3),

    CONSTRAINT "HealthSafetyRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthSafetyReview" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewerName" TEXT,
    "reviewerRole" TEXT NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "reason" TEXT,
    "modifications" JSONB NOT NULL DEFAULT '{}',
    "secondReviewerId" TEXT,
    "secondDecision" "ReviewDecision",
    "followUpOwnerId" TEXT,
    "reassessAt" TIMESTAMP(3),
    "viewedEvidence" BOOLEAN NOT NULL DEFAULT false,
    "viewedTrends" BOOLEAN NOT NULL DEFAULT false,
    "requestedSecondOpinion" BOOLEAN NOT NULL DEFAULT false,
    "timeToReviewSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthSafetyReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthSafetyIncident" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "SafetyIncidentKind" NOT NULL,
    "severity" "SafetyIncidentSeverity" NOT NULL DEFAULT 'MODERATE',
    "status" "SafetyIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "patientId" TEXT,
    "encounterId" TEXT,
    "recommendationId" TEXT,
    "modelId" TEXT,
    "modelVersion" TEXT,
    "policyVersion" TEXT,
    "inputSnapshot" JSONB NOT NULL DEFAULT '{}',
    "decisionPath" JSONB NOT NULL DEFAULT '[]',
    "timeline" JSONB NOT NULL DEFAULT '[]',
    "contributing" JSONB NOT NULL DEFAULT '[]',
    "detectability" TEXT,
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "preventiveAction" TEXT,
    "regulatoryReport" TEXT,
    "closureOwnerId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthSafetyIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthSafetyCase" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "safetyClaim" TEXT NOT NULL,
    "subclaims" JSONB NOT NULL DEFAULT '[]',
    "hazardAnalysis" JSONB NOT NULL DEFAULT '{}',
    "riskControls" JSONB NOT NULL DEFAULT '[]',
    "verification" JSONB NOT NULL DEFAULT '{}',
    "clinicalValidation" JSONB NOT NULL DEFAULT '{}',
    "residualRisk" TEXT NOT NULL DEFAULT '',
    "monitoring" JSONB NOT NULL DEFAULT '{}',
    "status" "SafetyCaseStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthSafetyCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthSafetyAudit" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "safetyEventId" TEXT,
    "traceId" TEXT NOT NULL,
    "patientContext" JSONB NOT NULL DEFAULT '{}',
    "recommendation" JSONB NOT NULL DEFAULT '{}',
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "decision" JSONB NOT NULL DEFAULT '{}',
    "execution" JSONB NOT NULL DEFAULT '{}',
    "auditMeta" JSONB NOT NULL DEFAULT '{}',
    "actorId" TEXT,
    "actorRole" TEXT,
    "hash" TEXT NOT NULL,
    "chainPrev" TEXT,
    "chainIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthSafetyAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthSafetyMonitor" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "sensitivity" JSONB NOT NULL DEFAULT '{}',
    "specificity" JSONB NOT NULL DEFAULT '{}',
    "ppv" JSONB NOT NULL DEFAULT '{}',
    "npv" JSONB NOT NULL DEFAULT '{}',
    "calibrationError" JSONB NOT NULL DEFAULT '{}',
    "abstentionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "drift" JSONB NOT NULL DEFAULT '{}',
    "subgroupPerf" JSONB NOT NULL DEFAULT '{}',
    "oodRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timeToAckSec" JSONB NOT NULL DEFAULT '{}',
    "timeToReviewSec" JSONB NOT NULL DEFAULT '{}',
    "overrideRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duplicateRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "escalationFailRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "alertBurdenPerClinician" JSONB NOT NULL DEFAULT '{}',
    "automationBias" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthSafetyMonitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthModelRegistry_workspaceId_modelId_modelVersion_key" ON "HealthModelRegistry"("workspaceId", "modelId", "modelVersion");
CREATE INDEX "HealthModelRegistry_workspaceId_safetyClass_idx" ON "HealthModelRegistry"("workspaceId", "safetyClass");
CREATE INDEX "HealthModelRegistry_workspaceId_status_idx" ON "HealthModelRegistry"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "HealthOperatingEnvelope_workspaceId_modelId_idx" ON "HealthOperatingEnvelope"("workspaceId", "modelId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthSafetyPolicy_workspaceId_policyKey_version_key" ON "HealthSafetyPolicy"("workspaceId", "policyKey", "version");
CREATE INDEX "HealthSafetyPolicy_workspaceId_riskClass_idx" ON "HealthSafetyPolicy"("workspaceId", "riskClass");

-- CreateIndex
CREATE INDEX "HealthSafetyRecommendation_workspaceId_state_idx" ON "HealthSafetyRecommendation"("workspaceId", "state");
CREATE INDEX "HealthSafetyRecommendation_workspaceId_patientId_idx" ON "HealthSafetyRecommendation"("workspaceId", "patientId");
CREATE INDEX "HealthSafetyRecommendation_workspaceId_safetyClass_idx" ON "HealthSafetyRecommendation"("workspaceId", "safetyClass");
CREATE INDEX "HealthSafetyRecommendation_workspaceId_kind_idx" ON "HealthSafetyRecommendation"("workspaceId", "kind");
CREATE INDEX "HealthSafetyRecommendation_workspaceId_createdAt_idx" ON "HealthSafetyRecommendation"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "HealthSafetyReview_workspaceId_recommendationId_idx" ON "HealthSafetyReview"("workspaceId", "recommendationId");
CREATE INDEX "HealthSafetyReview_reviewerId_idx" ON "HealthSafetyReview"("reviewerId");

-- CreateIndex
CREATE INDEX "HealthSafetyIncident_workspaceId_status_idx" ON "HealthSafetyIncident"("workspaceId", "status");
CREATE INDEX "HealthSafetyIncident_workspaceId_kind_idx" ON "HealthSafetyIncident"("workspaceId", "kind");
CREATE INDEX "HealthSafetyIncident_workspaceId_severity_idx" ON "HealthSafetyIncident"("workspaceId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "HealthSafetyCase_workspaceId_featureKey_version_key" ON "HealthSafetyCase"("workspaceId", "featureKey", "version");
CREATE INDEX "HealthSafetyCase_workspaceId_status_idx" ON "HealthSafetyCase"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HealthSafetyAudit_workspaceId_chainIndex_key" ON "HealthSafetyAudit"("workspaceId", "chainIndex");
CREATE INDEX "HealthSafetyAudit_workspaceId_recommendationId_idx" ON "HealthSafetyAudit"("workspaceId", "recommendationId");
CREATE INDEX "HealthSafetyAudit_traceId_idx" ON "HealthSafetyAudit"("traceId");

-- CreateIndex
CREATE INDEX "HealthSafetyMonitor_workspaceId_windowStart_idx" ON "HealthSafetyMonitor"("workspaceId", "windowStart" DESC);

-- AddForeignKey
ALTER TABLE "HealthModelRegistry" ADD CONSTRAINT "HealthModelRegistry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthOperatingEnvelope" ADD CONSTRAINT "HealthOperatingEnvelope_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthSafetyPolicy" ADD CONSTRAINT "HealthSafetyPolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthSafetyRecommendation" ADD CONSTRAINT "HealthSafetyRecommendation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthSafetyReview" ADD CONSTRAINT "HealthSafetyReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthSafetyReview" ADD CONSTRAINT "HealthSafetyReview_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "HealthSafetyRecommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthSafetyReview" ADD CONSTRAINT "HealthSafetyReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthSafetyIncident" ADD CONSTRAINT "HealthSafetyIncident_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthSafetyCase" ADD CONSTRAINT "HealthSafetyCase_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthSafetyAudit" ADD CONSTRAINT "HealthSafetyAudit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthSafetyAudit" ADD CONSTRAINT "HealthSafetyAudit_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "HealthSafetyRecommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthSafetyMonitor" ADD CONSTRAINT "HealthSafetyMonitor_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default policies (S0-S5) — separate from model inference
INSERT INTO "HealthSafetyPolicy" ("id", "workspaceId", "policyKey", "name", "description", "riskClass", "conditions", "controls", "version", "active")
SELECT gen_random_uuid(), "Workspace"."id", 'medication_dose_change', 'Medication Dose Change (S5)', 'High-risk dosing requires prescriber + pharmacist, narrow therapeutic index handling', 'S5', '{"patient_factors":["renal_impairment","pregnancy","pediatric","allergy_conflict","narrow_therapeutic_index"]}'::jsonb, '{"require_prescriber_approval":true,"require_pharmacist_review":true,"block_autonomous_execution":true,"show_contraindications":true,"require_recent_labs_hours":24,"create_reassessment_task":true}'::jsonb, '1.0.0', true FROM "Workspace" ON CONFLICT DO NOTHING;

INSERT INTO "HealthSafetyPolicy" ("id", "workspaceId", "policyKey", "name", "description", "riskClass", "conditions", "controls", "version", "active")
SELECT gen_random_uuid(), "Workspace"."id", 'sepsis_signal', 'Sepsis Signal (S4)', 'Sepsis risk signal requires clinical assessment — not confirmed, show trends not score, block auto antibiotics', 'S4', '{"kind":"sepsis"}'::jsonb, '{"require_clinician_review":true,"block_auto_antibiotic_selection":true,"require_trends_display":true,"create_timebound_review":true}'::jsonb, '1.0.0', true FROM "Workspace" ON CONFLICT DO NOTHING;

INSERT INTO "HealthSafetyPolicy" ("id", "workspaceId", "policyKey", "name", "description", "riskClass", "conditions", "controls", "version", "active")
SELECT gen_random_uuid(), "Workspace"."id", 'suicide_risk', 'Suicide Risk (S4)', 'Trauma-informed, no passive-signal imminent risk claim, validated assessment + human conversation', 'S4', '{"kind":"suicide"}'::jsonb, '{"require_validated_assessment":true,"suppress_opaque_messaging":true,"immediate_human_contact":true}'::jsonb, '1.0.0', true FROM "Workspace" ON CONFLICT DO NOTHING;

INSERT INTO "HealthSafetyPolicy" ("id", "workspaceId", "policyKey", "name", "description", "riskClass", "conditions", "controls", "version", "active")
SELECT gen_random_uuid(), "Workspace"."id", 'emergency_dispatch', 'Emergency Dispatch (S5)', 'Validated jurisdiction-specific workflow, multi-modality confirmation, two-way voice/text', 'S5', '{"kind":"emergency_dispatch"}'::jsonb, '{"require_location_verification":true,"attempt_two_way_confirmation":true,"jurisdiction_specific":true,"minimum_info_only":true}'::jsonb, '1.0.0', true FROM "Workspace" ON CONFLICT DO NOTHING;
