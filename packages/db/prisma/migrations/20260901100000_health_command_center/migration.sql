-- Unified Patient Command Center — prioritized, explainable daily workspace
-- AHRQ health-literacy, WCAG 2.2 AA, NHS inclusion

-- CreateEnum
CREATE TYPE "CareContext" AS ENUM ('STABLE_WELLNESS', 'NEW_DIAGNOSIS', 'POST_DISCHARGE_RECOVERY', 'PREGNANCY', 'CHRONIC_DISEASE_MONITORING', 'ACTIVE_TREATMENT', 'MENTAL_HEALTH_SUPPORT', 'CAREGIVER_MANAGED_CARE', 'PEDIATRIC_ADOLESCENT_CARE', 'PALLIATIVE_HOSPICE_CARE', 'EMERGENCY_URGENT_FOLLOWUP');

-- CreateEnum
CREATE TYPE "PriorityLevel" AS ENUM ('EMERGENCY', 'URGENT', 'IMPORTANT', 'ROUTINE', 'INFORMATIONAL');

-- CreateEnum
CREATE TYPE "HealthTaskStatus" AS ENUM ('PLANNED', 'DUE_TODAY', 'IN_PROGRESS', 'COMPLETED', 'MISSED', 'RESCHEDULED', 'WAITING_FOR_CLINICIAN', 'BLOCKED', 'CANCELLED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('NEW', 'AWAITING_CLINICIAN_REVIEW', 'REVIEWED', 'ACTION_REQUESTED', 'REPEAT_RECOMMENDED', 'STABLE_OR_EXPECTED', 'CONFLICTING', 'URGENT_ESCALATION');

-- CreateEnum
CREATE TYPE "WhatChangedCategory" AS ENUM ('NEW', 'IMPROVED', 'WORSENED', 'STABLE', 'MISSING', 'CORRECTED', 'RECLASSIFIED', 'AWAITING_REVIEW', 'NEWLY_RESTRICTED_BY_CONSENT', 'NEWLY_SHARED_WITH_CARE_TEAM', 'NEWLY_ADDED_TO_TREATMENT_PLAN');

-- CreateTable
CREATE TABLE "HealthPatientGoal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "goalType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPatientGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPriorityItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "whatChanged" TEXT,
    "nextStep" TEXT,
    "urgency" TEXT,
    "reason" TEXT,
    "dataSource" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" TEXT,
    "responsiblePerson" TEXT,
    "dueAt" TIMESTAMP(3),
    "priority" "PriorityLevel" NOT NULL DEFAULT 'ROUTINE',
    "status" TEXT NOT NULL DEFAULT 'awaiting_patient_action',
    "requiresHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "whyShown" TEXT,
    "provenanceRef" TEXT,
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "reviewedByClinician" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPriorityItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthWhatChangedEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "category" "WhatChangedCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "supportingRecordId" TEXT,
    "provenanceRef" TEXT,
    "referencePoint" TEXT,
    "referenceDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthWhatChangedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCommandCenterSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "careContext" "CareContext" NOT NULL DEFAULT 'STABLE_WELLNESS',
    "homeScreen" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthCommandCenterSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HealthPatientGoal_workspaceId_patientId_idx" ON "HealthPatientGoal"("workspaceId", "patientId");

-- CreateIndex
CREATE INDEX "HealthPriorityItem_workspaceId_patientId_idx" ON "HealthPriorityItem"("workspaceId", "patientId");
CREATE INDEX "HealthPriorityItem_priority_idx" ON "HealthPriorityItem"("priority");
CREATE INDEX "HealthPriorityItem_dueAt_idx" ON "HealthPriorityItem"("dueAt");

-- CreateIndex
CREATE INDEX "HealthWhatChangedEvent_workspaceId_patientId_idx" ON "HealthWhatChangedEvent"("workspaceId", "patientId");
CREATE INDEX "HealthWhatChangedEvent_category_idx" ON "HealthWhatChangedEvent"("category");
CREATE INDEX "HealthWhatChangedEvent_referencePoint_idx" ON "HealthWhatChangedEvent"("referencePoint");

-- CreateIndex
CREATE INDEX "HealthCommandCenterSnapshot_workspaceId_patientId_idx" ON "HealthCommandCenterSnapshot"("workspaceId", "patientId");
CREATE INDEX "HealthCommandCenterSnapshot_asOf_idx" ON "HealthCommandCenterSnapshot"("asOf" DESC);

-- AddForeignKey
ALTER TABLE "HealthPatientGoal" ADD CONSTRAINT "HealthPatientGoal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthPatientGoal" ADD CONSTRAINT "HealthPatientGoal_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPriorityItem" ADD CONSTRAINT "HealthPriorityItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthPriorityItem" ADD CONSTRAINT "HealthPriorityItem_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthWhatChangedEvent" ADD CONSTRAINT "HealthWhatChangedEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthWhatChangedEvent" ADD CONSTRAINT "HealthWhatChangedEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCommandCenterSnapshot" ADD CONSTRAINT "HealthCommandCenterSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthCommandCenterSnapshot" ADD CONSTRAINT "HealthCommandCenterSnapshot_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
