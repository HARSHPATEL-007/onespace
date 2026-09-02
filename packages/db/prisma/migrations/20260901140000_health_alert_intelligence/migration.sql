-- Alert Intelligence and Response Service — managed clinical events, not individual notifications. AHRQ, Joint Commission.
-- Signal Quality → Candidate → Deduplication → Baseline/Context → Priority/Actionability → Suppression/Cooldown → Routing/Escalation → Acknowledgement/Action → Outcome/Fatigue → Policy/Model Improvement

-- CreateEnum
CREATE TYPE "AlertCandidateType" AS ENUM ('ELEVATED_BP', 'DISCONNECTED_SENSOR', 'MISSED_MEDICATION', 'MODEL_RISK_SCORE', 'LOW_QUALITY_SIGNAL', 'NEW_LAB_RESULT', 'PATIENT_REPORTED_SYMPTOM');

-- CreateEnum
CREATE TYPE "AlertLifecycleStatus" AS ENUM ('CANDIDATE', 'VALIDATED', 'DEDUPLICATED', 'CLUSTERED', 'PRIORITIZED', 'ROUTED', 'DELIVERED', 'ACKNOWLEDGED', 'ACTIONED', 'RESOLVED', 'OUTCOME_RECORDED', 'SUPPRESSED', 'SNOOZED', 'ESCALATED', 'EXPIRED', 'RETRACTED', 'FALSE_POSITIVE', 'DUPLICATE', 'DATA_QUALITY_ISSUE', 'PATIENT_DECLINED', 'UNABLE_TO_DELIVER', 'AWAITING_CLINICIAN_REVIEW', 'NO_OUTCOME_RECORDED');

-- CreateEnum
CREATE TYPE "PriorityTier" AS ENUM ('P0', 'P1', 'P2', 'P3', 'P4', 'P5');

-- CreateEnum
CREATE TYPE "AcknowledgementState" AS ENUM ('DELIVERED', 'OPENED', 'SEEN', 'ACKNOWLEDGED', 'ACCEPTED', 'DEFERRED', 'REASSIGNED', 'ESCALATED', 'ACTION_INITIATED', 'RESOLVED', 'UNABLE_TO_ACT', 'FALSE_POSITIVE', 'PATIENT_DECLINED');

-- CreateTable
CREATE TABLE "HealthAlertCandidate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT,
    "encounterId" TEXT,
    "candidateType" "AlertCandidateType" NOT NULL,
    "source" TEXT,
    "value" JSONB,
    "quality" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "AlertLifecycleStatus" NOT NULL DEFAULT 'CANDIDATE',
    "provenanceRef" TEXT,
    "policyVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthAlertCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthAlertCluster" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT,
    "clusterId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'clinical_risk_cluster',
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'urgent',
    "urgency" TEXT NOT NULL DEFAULT 'same_day',
    "actionability" TEXT NOT NULL DEFAULT 'high',
    "status" "AlertLifecycleStatus" NOT NULL DEFAULT 'CLUSTERED',
    "candidateIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reason" TEXT,
    "scoring" JSONB NOT NULL DEFAULT '{}',
    "priorityTier" "PriorityTier" NOT NULL DEFAULT 'P2',
    "priorityScore" DOUBLE PRECISION,
    "routing" JSONB NOT NULL DEFAULT '{}',
    "policy" JSONB NOT NULL DEFAULT '{}',
    "provenanceRef" TEXT,
    "explanationRef" TEXT,
    "acknowledgementState" "AcknowledgementState",
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthAlertCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPatientBaseline" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "baseline" JSONB NOT NULL DEFAULT '{}',
    "adaptation" JSONB NOT NULL DEFAULT '{}',
    "lastAdaptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPatientBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthAlertSuppressionLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT,
    "candidateId" TEXT,
    "clusterId" TEXT,
    "reason" TEXT NOT NULL,
    "ruleVersion" TEXT,
    "duration" TEXT,
    "underlyingCandidates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "overrideAvailable" BOOLEAN NOT NULL DEFAULT true,
    "reviewDate" TIMESTAMP(3),
    "safetyImpact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthAlertSuppressionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthAlertOutcome" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT,
    "alertId" TEXT,
    "candidateId" TEXT,
    "outcome" TEXT NOT NULL,
    "clinicalAssessment" TEXT,
    "repeatMeasurements" TEXT,
    "orders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "medicationChanges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "messages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "admissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "escalations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "patientReportedOutcomes" TEXT,
    "adverseEvents" TEXT,
    "resolution" TEXT,
    "followUpInterval" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthAlertOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HealthAlertCandidate_workspaceId_patientId_idx" ON "HealthAlertCandidate"("workspaceId", "patientId");
CREATE INDEX "HealthAlertCandidate_candidateType_idx" ON "HealthAlertCandidate"("candidateType");
CREATE INDEX "HealthAlertCandidate_status_idx" ON "HealthAlertCandidate"("status");
CREATE INDEX "HealthAlertCandidate_timestamp_idx" ON "HealthAlertCandidate"("timestamp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "HealthAlertCluster_clusterId_key" ON "HealthAlertCluster"("clusterId");
CREATE INDEX "HealthAlertCluster_workspaceId_patientId_idx" ON "HealthAlertCluster"("workspaceId", "patientId");
CREATE INDEX "HealthAlertCluster_priorityTier_idx" ON "HealthAlertCluster"("priorityTier");
CREATE INDEX "HealthAlertCluster_status_idx" ON "HealthAlertCluster"("status");
CREATE INDEX "HealthAlertCluster_createdAt_idx" ON "HealthAlertCluster"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "HealthPatientBaseline_workspaceId_patientId_metric_key" ON "HealthPatientBaseline"("workspaceId", "patientId", "metric");
CREATE INDEX "HealthPatientBaseline_workspaceId_patientId_idx" ON "HealthPatientBaseline"("workspaceId", "patientId");

-- CreateIndex
CREATE INDEX "HealthAlertSuppressionLog_workspaceId_patientId_idx" ON "HealthAlertSuppressionLog"("workspaceId", "patientId");
CREATE INDEX "HealthAlertSuppressionLog_candidateId_idx" ON "HealthAlertSuppressionLog"("candidateId");
CREATE INDEX "HealthAlertSuppressionLog_clusterId_idx" ON "HealthAlertSuppressionLog"("clusterId");

-- CreateIndex
CREATE INDEX "HealthAlertOutcome_workspaceId_patientId_idx" ON "HealthAlertOutcome"("workspaceId", "patientId");
CREATE INDEX "HealthAlertOutcome_alertId_idx" ON "HealthAlertOutcome"("alertId");
CREATE INDEX "HealthAlertOutcome_outcome_idx" ON "HealthAlertOutcome"("outcome");

-- AddForeignKey
ALTER TABLE "HealthAlertCandidate" ADD CONSTRAINT "HealthAlertCandidate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthAlertCandidate" ADD CONSTRAINT "HealthAlertCandidate_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthAlertCluster" ADD CONSTRAINT "HealthAlertCluster_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthAlertCluster" ADD CONSTRAINT "HealthAlertCluster_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPatientBaseline" ADD CONSTRAINT "HealthPatientBaseline_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthPatientBaseline" ADD CONSTRAINT "HealthPatientBaseline_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthAlertSuppressionLog" ADD CONSTRAINT "HealthAlertSuppressionLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthAlertSuppressionLog" ADD CONSTRAINT "HealthAlertSuppressionLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthAlertOutcome" ADD CONSTRAINT "HealthAlertOutcome_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthAlertOutcome" ADD CONSTRAINT "HealthAlertOutcome_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
