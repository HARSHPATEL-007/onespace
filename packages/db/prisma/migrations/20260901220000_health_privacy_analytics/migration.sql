-- N0VA Privacy-Preserving Analytics Plane — policy-before-access, query risk
-- scoring, release-level ledger, budget accounting, incident response.
-- Every analytical query selects a privacy mode before data access; noisy
-- outputs are never described as exact; small cells are suppressed.

-- CreateTable
CREATE TABLE "HealthPrivacyPolicy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "dataScope" TEXT[] NOT NULL DEFAULT '{}',
    "allowedUsers" TEXT[] NOT NULL DEFAULT '{}',
    "jurisdiction" TEXT NOT NULL DEFAULT 'configured',
    "privacyMode" TEXT NOT NULL,
    "minimumCohortSize" INTEGER NOT NULL DEFAULT 20,
    "quasiIdentifierRules" JSONB NOT NULL DEFAULT '{}',
    "privacyBudget" JSONB NOT NULL DEFAULT '{}',
    "genomicData" TEXT NOT NULL DEFAULT 'excluded',
    "reidentification" JSONB NOT NULL DEFAULT '{}',
    "outputDestination" TEXT NOT NULL DEFAULT 'internal_dashboard',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approver" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPrivacyPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPrivacyQuery" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'unspecified',
    "assessment" JSONB NOT NULL DEFAULT '{}',
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "drivers" TEXT[] NOT NULL DEFAULT '{}',
    "decision" TEXT NOT NULL DEFAULT 'allow',
    "requiredAction" TEXT NOT NULL DEFAULT 'execute_under_policy',
    "policyVersion" TEXT NOT NULL DEFAULT '2026.09',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthPrivacyQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPrivacyRelease" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "requester" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "dataset" TEXT NOT NULL,
    "privacyMode" TEXT NOT NULL,
    "recordsEligible" INTEGER NOT NULL DEFAULT 0,
    "cohortThreshold" INTEGER NOT NULL DEFAULT 20,
    "suppressionApplied" BOOLEAN NOT NULL DEFAULT false,
    "epsilonConsumed" TEXT NOT NULL DEFAULT 'configured',
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "humanReview" TEXT NOT NULL DEFAULT 'approved',
    "recipient" TEXT NOT NULL DEFAULT 'clean-room-workspace',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reidentificationProhibited" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthPrivacyRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPrivacyBudget" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dataset" TEXT NOT NULL,
    "principal" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'calendar_quarter',
    "consumed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "limit" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPrivacyBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPrivacyIncident" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'HIGH',
    "queryId" TEXT,
    "releaseId" TEXT,
    "detail" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "responseActions" TEXT[] NOT NULL DEFAULT '{}',
    "resolution" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPrivacyIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthPrivacyPolicy_workspaceId_policyId_key" ON "HealthPrivacyPolicy"("workspaceId", "policyId");
CREATE INDEX "HealthPrivacyPolicy_workspaceId_privacyMode_idx" ON "HealthPrivacyPolicy"("workspaceId", "privacyMode");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPrivacyQuery_workspaceId_queryId_key" ON "HealthPrivacyQuery"("workspaceId", "queryId");
CREATE INDEX "HealthPrivacyQuery_workspaceId_riskLevel_idx" ON "HealthPrivacyQuery"("workspaceId", "riskLevel");
CREATE INDEX "HealthPrivacyQuery_workspaceId_createdAt_idx" ON "HealthPrivacyQuery"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "HealthPrivacyRelease_workspaceId_releaseId_key" ON "HealthPrivacyRelease"("workspaceId", "releaseId");
CREATE INDEX "HealthPrivacyRelease_workspaceId_dataset_idx" ON "HealthPrivacyRelease"("workspaceId", "dataset");
CREATE INDEX "HealthPrivacyRelease_workspaceId_createdAt_idx" ON "HealthPrivacyRelease"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "HealthPrivacyBudget_workspaceId_dataset_principal_period_key" ON "HealthPrivacyBudget"("workspaceId", "dataset", "principal", "period");
CREATE INDEX "HealthPrivacyBudget_workspaceId_dataset_idx" ON "HealthPrivacyBudget"("workspaceId", "dataset");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPrivacyIncident_workspaceId_incidentId_key" ON "HealthPrivacyIncident"("workspaceId", "incidentId");
CREATE INDEX "HealthPrivacyIncident_workspaceId_status_idx" ON "HealthPrivacyIncident"("workspaceId", "status");

-- AddForeignKey
ALTER TABLE "HealthPrivacyPolicy" ADD CONSTRAINT "HealthPrivacyPolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPrivacyQuery" ADD CONSTRAINT "HealthPrivacyQuery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPrivacyRelease" ADD CONSTRAINT "HealthPrivacyRelease_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPrivacyBudget" ADD CONSTRAINT "HealthPrivacyBudget_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPrivacyIncident" ADD CONSTRAINT "HealthPrivacyIncident_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
