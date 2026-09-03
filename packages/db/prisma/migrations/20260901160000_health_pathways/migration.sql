-- Closed-Loop Care Pathways — versioned, executable care program. FHIR PlanDefinition → ActivityDefinition → CarePlan, AHRQ coordination.
-- Eligibility → Verification → Invitation → Enrollment → Baseline → Goals/Risk → Interventions → Tasks → Monitoring → Escalation → Outcome → Completion → Reporting

-- CreateEnum
CREATE TYPE "PathwayDefinitionStatus" AS ENUM ('DRAFT', 'CLINICAL_VALIDATION', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('NOT_ELIGIBLE', 'POTENTIALLY_ELIGIBLE', 'AWAITING_VERIFICATION', 'INVITED', 'ENROLLED', 'BASELINE_INCOMPLETE', 'ACTIVE', 'PAUSED', 'ESCALATED', 'CLINICIAN_OVERRIDE', 'COMPLETED', 'UNSUCCESSFUL_COMPLETION', 'WITHDRAWN', 'LOST_TO_FOLLOW_UP', 'RE_ENROLLMENT_ELIGIBLE');

-- CreateTable
CREATE TABLE "HealthPathwayDefinition" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "status" "PathwayDefinitionStatus" NOT NULL DEFAULT 'DRAFT',
    "jurisdiction" TEXT,
    "owner" TEXT,
    "purpose" TEXT,
    "eligibility" JSONB NOT NULL DEFAULT '{}',
    "consent" JSONB NOT NULL DEFAULT '{}',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "outcomes" JSONB NOT NULL DEFAULT '[]',
    "exceptions" JSONB NOT NULL DEFAULT '[]',
    "clinicianOverride" BOOLEAN NOT NULL DEFAULT true,
    "reporting" JSONB NOT NULL DEFAULT '{}',
    "evidenceSources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "population" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "retirementDate" TIMESTAMP(3),
    "changeLog" TEXT,
    "validationStatus" TEXT,
    "qualityMeasures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "financialRules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exceptionRules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "modelDependencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rollbackVersion" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPathwayDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPathwayEnrollment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "pathwayVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'POTENTIALLY_ELIGIBLE',
    "candidateId" TEXT,
    "enrolledAt" TIMESTAMP(3),
    "consentRef" TEXT,
    "goals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "barriers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "caregiverId" TEXT,
    "reviewOwnerId" TEXT,
    "baseline" JSONB NOT NULL DEFAULT '{}',
    "riskTier" TEXT,
    "activeInterventions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "completionCriteria" JSONB NOT NULL DEFAULT '{}',
    "outcome" JSONB NOT NULL DEFAULT '{}',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPathwayEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPathwayException" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT,
    "pathwayId" TEXT,
    "enrollmentId" TEXT,
    "exceptionType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'moderate',
    "assignedOwner" TEXT,
    "resolutionOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPathwayException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthPathwayDefinition_workspaceId_pathwayId_version_key" ON "HealthPathwayDefinition"("workspaceId", "pathwayId", "version");
CREATE INDEX "HealthPathwayDefinition_workspaceId_pathwayId_idx" ON "HealthPathwayDefinition"("workspaceId", "pathwayId");
CREATE INDEX "HealthPathwayDefinition_status_idx" ON "HealthPathwayDefinition"("status");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPathwayEnrollment_workspaceId_patientId_pathwayId_key" ON "HealthPathwayEnrollment"("workspaceId", "patientId", "pathwayId");
CREATE INDEX "HealthPathwayEnrollment_workspaceId_pathwayId_idx" ON "HealthPathwayEnrollment"("workspaceId", "pathwayId");
CREATE INDEX "HealthPathwayEnrollment_status_idx" ON "HealthPathwayEnrollment"("status");
CREATE INDEX "HealthPathwayEnrollment_patientId_idx" ON "HealthPathwayEnrollment"("patientId");

-- CreateIndex
CREATE INDEX "HealthPathwayException_workspaceId_patientId_idx" ON "HealthPathwayException"("workspaceId", "patientId");
CREATE INDEX "HealthPathwayException_exceptionType_idx" ON "HealthPathwayException"("exceptionType");
CREATE INDEX "HealthPathwayException_status_idx" ON "HealthPathwayException"("status");

-- AddForeignKey
ALTER TABLE "HealthPathwayDefinition" ADD CONSTRAINT "HealthPathwayDefinition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPathwayEnrollment" ADD CONSTRAINT "HealthPathwayEnrollment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthPathwayEnrollment" ADD CONSTRAINT "HealthPathwayEnrollment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPathwayException" ADD CONSTRAINT "HealthPathwayException_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthPathwayException" ADD CONSTRAINT "HealthPathwayException_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
