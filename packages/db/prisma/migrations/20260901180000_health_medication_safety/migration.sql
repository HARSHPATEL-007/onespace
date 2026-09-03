-- Medication Safety Cockpit — one reconciled, patient-confirmed medication picture.
-- FHIR separation preserved: MedicationRequest (prescribed) vs MedicationDispense (supplied)
-- vs MedicationStatement (reported) vs MedicationAdministration (given).

-- CreateEnum
CREATE TYPE "MedicationRecordStatus" AS ENUM ('PRESCRIBED', 'DISPENSED', 'PATIENT_REPORTED_CURRENT', 'CAREGIVER_REPORTED', 'ADMINISTERED', 'PATIENT_CONFIRMED_CURRENT', 'PATIENT_STOPPED', 'CLINICIAN_DISCONTINUED', 'UNCERTAIN', 'HISTORICAL', 'DUPLICATE', 'REFUSED', 'UNABLE_TO_OBTAIN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MedicationChangeStatus" AS ENUM ('PROPOSED', 'AUTHORIZED', 'SAFETY_CHECKED', 'EXPLAINED', 'PATIENT_CONFIRMED', 'PHARMACY_SENT', 'ACTIVE', 'UNCONFIRMED', 'DECLINED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MedicationAlertSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MODERATE', 'LOW');

-- CreateTable
CREATE TABLE "MedicationRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "ingredient" TEXT NOT NULL,
    "ingredients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "therapeuticClass" TEXT,
    "strength" TEXT,
    "form" TEXT,
    "route" TEXT,
    "directions" JSONB NOT NULL DEFAULT '{}',
    "status" "MedicationRecordStatus" NOT NULL DEFAULT 'UNKNOWN',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "indication" TEXT,
    "prescriber" TEXT,
    "pharmacy" TEXT,
    "reconciliation" JSONB NOT NULL DEFAULT '{}',
    "safetyContext" JSONB NOT NULL DEFAULT '{}',
    "missedDoseRule" TEXT,
    "timeCritical" BOOLEAN NOT NULL DEFAULT false,
    "renalRisk" BOOLEAN NOT NULL DEFAULT false,
    "hepatotoxic" BOOLEAN NOT NULL DEFAULT false,
    "pregnancyRisk" BOOLEAN NOT NULL DEFAULT false,
    "controlledClass" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationPhoto" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordId" TEXT,
    "imageRef" TEXT NOT NULL,
    "ocr" JSONB NOT NULL DEFAULT '{}',
    "extracted" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'CAPTURED',
    "reviewerNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationConfirmation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "teachBack" JSONB NOT NULL DEFAULT '{}',
    "confirmedBy" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicationConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationChange" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordId" TEXT,
    "changeType" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "reason" TEXT,
    "authorizedBy" TEXT,
    "safetyCheck" JSONB NOT NULL DEFAULT '{}',
    "patientExplanation" TEXT,
    "patientConfirmation" JSONB NOT NULL DEFAULT '{}',
    "pharmacyStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "status" "MedicationChangeStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationTaper" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "changeId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'TAPER',
    "reason" TEXT,
    "approvedBy" TEXT,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "pauseRules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contactRules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "patientConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "caregiverAccess" TEXT NOT NULL DEFAULT 'task_only',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationTaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationAlert" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordId" TEXT,
    "alertClass" TEXT NOT NULL,
    "severity" "MedicationAlertSeverity" NOT NULL DEFAULT 'MODERATE',
    "why" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "source" TEXT,
    "confidence" TEXT,
    "reviewer" TEXT,
    "patientNotified" BOOLEAN NOT NULL DEFAULT false,
    "actionBlocked" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationAdverseEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordId" TEXT,
    "symptom" TEXT NOT NULL,
    "onsetAt" TIMESTAMP(3),
    "severity" TEXT NOT NULL DEFAULT 'MODERATE',
    "outcome" TEXT,
    "hospitalized" BOOLEAN NOT NULL DEFAULT false,
    "actionTaken" TEXT,
    "dechallenge" TEXT,
    "rechallenge" TEXT,
    "reporter" TEXT,
    "reportId" TEXT,
    "reportStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationAdverseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordId" TEXT,
    "direction" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "body" TEXT,
    "patientAuthorized" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "responseDeadline" TIMESTAMP(3),
    "owner" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlledSubstancePolicy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "medicineClass" TEXT NOT NULL,
    "rules" JSONB NOT NULL DEFAULT '[]',
    "source" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "owner" TEXT,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlledSubstancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffordabilityReview" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordId" TEXT,
    "barrier" JSONB NOT NULL DEFAULT '{}',
    "options" JSONB NOT NULL DEFAULT '[]',
    "selectedBy" TEXT,
    "patientConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffordabilityReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationAllergy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "substance" TEXT NOT NULL,
    "reaction" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'MODERATE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationAllergy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MedicationRecord_workspaceId_patientId_status_idx" ON "MedicationRecord"("workspaceId", "patientId", "status");
CREATE INDEX "MedicationRecord_workspaceId_ingredient_idx" ON "MedicationRecord"("workspaceId", "ingredient");

-- CreateIndex
CREATE INDEX "MedicationPhoto_workspaceId_patientId_status_idx" ON "MedicationPhoto"("workspaceId", "patientId", "status");
CREATE INDEX "MedicationPhoto_recordId_idx" ON "MedicationPhoto"("recordId");

-- CreateIndex
CREATE INDEX "MedicationConfirmation_workspaceId_recordId_idx" ON "MedicationConfirmation"("workspaceId", "recordId");
CREATE INDEX "MedicationConfirmation_workspaceId_patientId_idx" ON "MedicationConfirmation"("workspaceId", "patientId");

-- CreateIndex
CREATE INDEX "MedicationChange_workspaceId_patientId_status_idx" ON "MedicationChange"("workspaceId", "patientId", "status");
CREATE INDEX "MedicationChange_recordId_idx" ON "MedicationChange"("recordId");

-- CreateIndex
CREATE INDEX "MedicationTaper_workspaceId_patientId_status_idx" ON "MedicationTaper"("workspaceId", "patientId", "status");
CREATE INDEX "MedicationTaper_recordId_idx" ON "MedicationTaper"("recordId");

-- CreateIndex
CREATE INDEX "MedicationAlert_workspaceId_patientId_status_idx" ON "MedicationAlert"("workspaceId", "patientId", "status");
CREATE INDEX "MedicationAlert_workspaceId_alertClass_idx" ON "MedicationAlert"("workspaceId", "alertClass");

-- CreateIndex
CREATE INDEX "MedicationAdverseEvent_workspaceId_patientId_reportStatus_idx" ON "MedicationAdverseEvent"("workspaceId", "patientId", "reportStatus");
CREATE INDEX "MedicationAdverseEvent_recordId_idx" ON "MedicationAdverseEvent"("recordId");

-- CreateIndex
CREATE INDEX "PharmacyMessage_workspaceId_patientId_status_idx" ON "PharmacyMessage"("workspaceId", "patientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ControlledSubstancePolicy_workspaceId_jurisdiction_medicineClass_version_key" ON "ControlledSubstancePolicy"("workspaceId", "jurisdiction", "medicineClass", "version");
CREATE INDEX "ControlledSubstancePolicy_workspaceId_jurisdiction_idx" ON "ControlledSubstancePolicy"("workspaceId", "jurisdiction");
CREATE INDEX "ControlledSubstancePolicy_active_idx" ON "ControlledSubstancePolicy"("active");

-- CreateIndex
CREATE INDEX "AffordabilityReview_workspaceId_patientId_status_idx" ON "AffordabilityReview"("workspaceId", "patientId", "status");

-- CreateIndex
CREATE INDEX "MedicationAllergy_workspaceId_patientId_status_idx" ON "MedicationAllergy"("workspaceId", "patientId", "status");
CREATE INDEX "MedicationAllergy_workspaceId_substance_idx" ON "MedicationAllergy"("workspaceId", "substance");

-- AddForeignKey
ALTER TABLE "MedicationRecord" ADD CONSTRAINT "MedicationRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationRecord" ADD CONSTRAINT "MedicationRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationPhoto" ADD CONSTRAINT "MedicationPhoto_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationPhoto" ADD CONSTRAINT "MedicationPhoto_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationConfirmation" ADD CONSTRAINT "MedicationConfirmation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationConfirmation" ADD CONSTRAINT "MedicationConfirmation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationChange" ADD CONSTRAINT "MedicationChange_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationChange" ADD CONSTRAINT "MedicationChange_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationTaper" ADD CONSTRAINT "MedicationTaper_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationTaper" ADD CONSTRAINT "MedicationTaper_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationAlert" ADD CONSTRAINT "MedicationAlert_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationAlert" ADD CONSTRAINT "MedicationAlert_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationAdverseEvent" ADD CONSTRAINT "MedicationAdverseEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationAdverseEvent" ADD CONSTRAINT "MedicationAdverseEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyMessage" ADD CONSTRAINT "PharmacyMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyMessage" ADD CONSTRAINT "PharmacyMessage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlledSubstancePolicy" ADD CONSTRAINT "ControlledSubstancePolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffordabilityReview" ADD CONSTRAINT "AffordabilityReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffordabilityReview" ADD CONSTRAINT "AffordabilityReview_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationAllergy" ADD CONSTRAINT "MedicationAllergy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MedicationAllergy" ADD CONSTRAINT "MedicationAllergy_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
