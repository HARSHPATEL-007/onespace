-- N0VA Cybersecurity and Clinical Resilience Program — asset inventory, SBOMs,
-- vulnerability lifecycle, device quarantine, recovery with separate technical
-- vs clinical validation, exercises, and cyber incidents. A cybersecurity
-- event must never become a silent patient-safety event.

-- CreateTable
CREATE TABLE "HealthCyberAsset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "clinicalCriticality" TEXT NOT NULL DEFAULT 'medium',
    "patientData" BOOLEAN NOT NULL DEFAULT false,
    "networkZone" TEXT NOT NULL DEFAULT 'default',
    "vendor" TEXT NOT NULL DEFAULT '',
    "firmware" TEXT NOT NULL DEFAULT '',
    "sbomRef" TEXT NOT NULL DEFAULT '',
    "supportStatus" TEXT NOT NULL DEFAULT 'supported',
    "patchWindow" TEXT NOT NULL DEFAULT 'configured',
    "rto" TEXT NOT NULL DEFAULT 'configured',
    "rpo" TEXT NOT NULL DEFAULT 'configured',
    "fallback" TEXT NOT NULL DEFAULT '',
    "securityContact" TEXT NOT NULL DEFAULT '',
    "lastValidation" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCyberAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCyberSbom" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sbomId" TEXT NOT NULL,
    "artifact" TEXT NOT NULL,
    "artifactDigest" TEXT NOT NULL DEFAULT '',
    "format" TEXT NOT NULL DEFAULT 'configured',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "components" JSONB NOT NULL DEFAULT '[]',
    "signer" TEXT NOT NULL DEFAULT '',
    "signature" TEXT NOT NULL DEFAULT '',
    "vulnerabilityScan" TEXT NOT NULL DEFAULT 'completed',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthCyberSbom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCyberVuln" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "vulnId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'HIGH',
    "factors" JSONB NOT NULL DEFAULT '{}',
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "riskLevel" TEXT NOT NULL DEFAULT 'MODERATE',
    "status" TEXT NOT NULL DEFAULT 'DISCOVERED',
    "assignee" TEXT NOT NULL DEFAULT '',
    "evidence" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCyberVuln_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCyberQuarantine" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "quarantineId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OBSERVATION',
    "clinicalCriticality" TEXT NOT NULL DEFAULT 'medium',
    "lifeCritical" BOOLEAN NOT NULL DEFAULT false,
    "clinicianMessage" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCyberQuarantine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCyberRecovery" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "recoveryId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'TIER_4',
    "technicalRestored" BOOLEAN NOT NULL DEFAULT false,
    "clinicallyValidated" BOOLEAN NOT NULL DEFAULT false,
    "validatedBy" TEXT,
    "rtoMinutes" INTEGER,
    "rpoMinutes" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCyberRecovery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCyberIncident" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'HIGH',
    "assetId" TEXT,
    "detail" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "responseActions" TEXT[] NOT NULL DEFAULT '{}',
    "resolution" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCyberIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCyberExercise" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "participants" TEXT[] NOT NULL DEFAULT '{}',
    "findings" TEXT[] NOT NULL DEFAULT '{}',
    "improvementOwners" JSONB NOT NULL DEFAULT '{}',
    "retestDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCyberExercise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthCyberAsset_workspaceId_assetId_key" ON "HealthCyberAsset"("workspaceId", "assetId");
CREATE INDEX "HealthCyberAsset_workspaceId_environment_idx" ON "HealthCyberAsset"("workspaceId", "environment");
CREATE INDEX "HealthCyberAsset_workspaceId_clinicalCriticality_idx" ON "HealthCyberAsset"("workspaceId", "clinicalCriticality");

-- CreateIndex
CREATE UNIQUE INDEX "HealthCyberSbom_workspaceId_sbomId_key" ON "HealthCyberSbom"("workspaceId", "sbomId");
CREATE INDEX "HealthCyberSbom_workspaceId_artifact_idx" ON "HealthCyberSbom"("workspaceId", "artifact");

-- CreateIndex
CREATE UNIQUE INDEX "HealthCyberVuln_workspaceId_vulnId_key" ON "HealthCyberVuln"("workspaceId", "vulnId");
CREATE INDEX "HealthCyberVuln_workspaceId_status_idx" ON "HealthCyberVuln"("workspaceId", "status");
CREATE INDEX "HealthCyberVuln_workspaceId_riskLevel_idx" ON "HealthCyberVuln"("workspaceId", "riskLevel");

-- CreateIndex
CREATE UNIQUE INDEX "HealthCyberQuarantine_workspaceId_quarantineId_key" ON "HealthCyberQuarantine"("workspaceId", "quarantineId");
CREATE INDEX "HealthCyberQuarantine_workspaceId_state_idx" ON "HealthCyberQuarantine"("workspaceId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "HealthCyberRecovery_workspaceId_recoveryId_key" ON "HealthCyberRecovery"("workspaceId", "recoveryId");
CREATE INDEX "HealthCyberRecovery_workspaceId_service_idx" ON "HealthCyberRecovery"("workspaceId", "service");

-- CreateIndex
CREATE UNIQUE INDEX "HealthCyberIncident_workspaceId_incidentId_key" ON "HealthCyberIncident"("workspaceId", "incidentId");
CREATE INDEX "HealthCyberIncident_workspaceId_status_idx" ON "HealthCyberIncident"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HealthCyberExercise_workspaceId_exerciseId_key" ON "HealthCyberExercise"("workspaceId", "exerciseId");
CREATE INDEX "HealthCyberExercise_workspaceId_kind_idx" ON "HealthCyberExercise"("workspaceId", "kind");

-- AddForeignKey
ALTER TABLE "HealthCyberAsset" ADD CONSTRAINT "HealthCyberAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCyberSbom" ADD CONSTRAINT "HealthCyberSbom_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCyberVuln" ADD CONSTRAINT "HealthCyberVuln_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCyberQuarantine" ADD CONSTRAINT "HealthCyberQuarantine_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCyberRecovery" ADD CONSTRAINT "HealthCyberRecovery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCyberIncident" ADD CONSTRAINT "HealthCyberIncident_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCyberExercise" ADD CONSTRAINT "HealthCyberExercise_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
