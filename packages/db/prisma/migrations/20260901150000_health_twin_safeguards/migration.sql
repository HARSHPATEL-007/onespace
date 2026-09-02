-- Digital Twin Safeguards — bounded, provenance-linked personal health model, not definitive virtual copy. NIST AI RMF, FDA CDS.

-- CreateEnum
CREATE TYPE "TwinOrigin" AS ENUM ('OBSERVED', 'PATIENT_REPORTED', 'CAREGIVER_REPORTED', 'CLINICIAN_ENTERED', 'IMPORTED', 'CALCULATED', 'INFERRED', 'SIMULATED', 'PROJECTED', 'SYNTHETIC', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TwinAttributeStatus" AS ENUM ('ACTIVE', 'OBSERVED', 'ESTIMATED', 'INFERRED', 'SIMULATED', 'PROJECTED', 'RESEARCH_ONLY', 'CLINICAL_VALIDATION', 'DISPUTED', 'SUPERSEDED', 'EXPIRED', 'WITHDRAWN', 'RESTRICTED', 'REJECTED', 'UNABLE_TO_VERIFY');

-- CreateEnum
CREATE TYPE "TwinCapabilityStatus" AS ENUM ('PRODUCTION', 'CLINICAL_VALIDATION', 'RESEARCH', 'CONCEPTUAL');

-- CreateTable
CREATE TABLE "HealthTwinAttribute" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "origin" "TwinOrigin" NOT NULL DEFAULT 'OBSERVED',
    "status" "TwinAttributeStatus" NOT NULL DEFAULT 'ACTIVE',
    "observedInputs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "modelName" TEXT,
    "modelVersion" TEXT,
    "artifactDigest" TEXT,
    "uncertainty" JSONB NOT NULL DEFAULT '{}',
    "timeValidAt" TIMESTAMP(3),
    "timeHorizon" TEXT,
    "timeExpiresAt" TIMESTAMP(3),
    "provenanceRef" TEXT,
    "consentRef" TEXT,
    "humanReview" BOOLEAN NOT NULL DEFAULT false,
    "intendedUse" TEXT,
    "capabilityStatus" "TwinCapabilityStatus" NOT NULL DEFAULT 'PRODUCTION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthTwinAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthTwinSimulation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "baseline" TEXT,
    "assumptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "horizon" TEXT,
    "output" JSONB NOT NULL DEFAULT '{}',
    "notAPrediction" BOOLEAN NOT NULL DEFAULT true,
    "notATreatmentInstruction" BOOLEAN NOT NULL DEFAULT true,
    "review" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthTwinSimulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthTwinDispute" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "attributeId" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disputed',
    "resolution" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "HealthTwinDispute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthTwinAttribute_attributeId_key" ON "HealthTwinAttribute"("attributeId");
CREATE INDEX "HealthTwinAttribute_workspaceId_patientId_idx" ON "HealthTwinAttribute"("workspaceId", "patientId");
CREATE INDEX "HealthTwinAttribute_origin_idx" ON "HealthTwinAttribute"("origin");
CREATE INDEX "HealthTwinAttribute_status_idx" ON "HealthTwinAttribute"("status");
CREATE INDEX "HealthTwinAttribute_capabilityStatus_idx" ON "HealthTwinAttribute"("capabilityStatus");

-- CreateIndex
CREATE UNIQUE INDEX "HealthTwinSimulation_simulationId_key" ON "HealthTwinSimulation"("simulationId");
CREATE INDEX "HealthTwinSimulation_workspaceId_patientId_idx" ON "HealthTwinSimulation"("workspaceId", "patientId");
CREATE INDEX "HealthTwinSimulation_simulationId_idx" ON "HealthTwinSimulation"("simulationId");

-- CreateIndex
CREATE INDEX "HealthTwinDispute_workspaceId_patientId_idx" ON "HealthTwinDispute"("workspaceId", "patientId");
CREATE INDEX "HealthTwinDispute_attributeId_idx" ON "HealthTwinDispute"("attributeId");
CREATE INDEX "HealthTwinDispute_status_idx" ON "HealthTwinDispute"("status");

-- AddForeignKey
ALTER TABLE "HealthTwinAttribute" ADD CONSTRAINT "HealthTwinAttribute_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthTwinAttribute" ADD CONSTRAINT "HealthTwinAttribute_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthTwinSimulation" ADD CONSTRAINT "HealthTwinSimulation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthTwinSimulation" ADD CONSTRAINT "HealthTwinSimulation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthTwinDispute" ADD CONSTRAINT "HealthTwinDispute_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthTwinDispute" ADD CONSTRAINT "HealthTwinDispute_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
