-- N0VA HEALTH Product Packaging — five bounded editions over one platform.
-- Capability entitlements as versioned policy, explicit regulatory and AI
-- risk classification, authorized cross-edition exchange, launch gates.

-- CreateTable
CREATE TABLE "HealthEditionEntitlement" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "edition" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'enabled',
    "scope" TEXT NOT NULL DEFAULT 'tenant',
    "requires" TEXT NOT NULL DEFAULT '',
    "addOn" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "specialty" TEXT NOT NULL DEFAULT '',
    "userRole" TEXT NOT NULL DEFAULT '',
    "effectiveDate" TIMESTAMP(3),
    "expiry" TIMESTAMP(3),
    "approvalRequirement" TEXT NOT NULL DEFAULT '',
    "usageLimit" TEXT NOT NULL DEFAULT '',
    "residencyConstraint" TEXT NOT NULL DEFAULT '',
    "approvedBy" TEXT NOT NULL DEFAULT '',
    "effectiveVersion" TEXT NOT NULL DEFAULT '2026.09.1',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthEditionEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthEditionRegulatory" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "classificationId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "edition" TEXT NOT NULL,
    "regulatoryClass" TEXT NOT NULL,
    "riskRationale" TEXT NOT NULL DEFAULT '',
    "intendedUse" TEXT NOT NULL DEFAULT '',
    "prohibitedUse" TEXT[] NOT NULL DEFAULT '{}',
    "certificationMapping" TEXT[] NOT NULL DEFAULT '{}',
    "reviewer" TEXT NOT NULL DEFAULT '',
    "reviewDate" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthEditionRegulatory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthEditionAi" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "aiId" TEXT NOT NULL,
    "aiFunction" TEXT NOT NULL,
    "edition" TEXT NOT NULL,
    "riskClass" TEXT NOT NULL DEFAULT 'WELLNESS',
    "modelVersions" TEXT[] NOT NULL DEFAULT '{}',
    "humanApproval" TEXT NOT NULL DEFAULT 'required',
    "patientDisclosure" TEXT NOT NULL DEFAULT 'configured',
    "prohibitedUse" TEXT[] NOT NULL DEFAULT '{}',
    "fallback" TEXT NOT NULL DEFAULT 'manual_workflow',
    "approvedBy" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthEditionAi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthEditionExchange" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "exchangeId" TEXT NOT NULL,
    "fromEdition" TEXT NOT NULL,
    "toEdition" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "authorizer" TEXT NOT NULL DEFAULT '',
    "consentRef" TEXT NOT NULL DEFAULT '',
    "legalBasis" TEXT NOT NULL DEFAULT '',
    "requirements" TEXT[] NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthEditionExchange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthEditionLaunch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "launchId" TEXT NOT NULL,
    "edition" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "gaps" TEXT[] NOT NULL DEFAULT '{}',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approver" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthEditionLaunch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthEditionEntitlement_workspaceId_entitlementId_key" ON "HealthEditionEntitlement"("workspaceId", "entitlementId");
CREATE INDEX "HealthEditionEntitlement_workspaceId_tenantId_idx" ON "HealthEditionEntitlement"("workspaceId", "tenantId");
CREATE INDEX "HealthEditionEntitlement_workspaceId_edition_idx" ON "HealthEditionEntitlement"("workspaceId", "edition");

-- CreateIndex
CREATE UNIQUE INDEX "HealthEditionRegulatory_workspaceId_classificationId_key" ON "HealthEditionRegulatory"("workspaceId", "classificationId");
CREATE INDEX "HealthEditionRegulatory_workspaceId_capability_idx" ON "HealthEditionRegulatory"("workspaceId", "capability");

-- CreateIndex
CREATE UNIQUE INDEX "HealthEditionAi_workspaceId_aiId_key" ON "HealthEditionAi"("workspaceId", "aiId");
CREATE INDEX "HealthEditionAi_workspaceId_edition_idx" ON "HealthEditionAi"("workspaceId", "edition");

-- CreateIndex
CREATE UNIQUE INDEX "HealthEditionExchange_workspaceId_exchangeId_key" ON "HealthEditionExchange"("workspaceId", "exchangeId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthEditionLaunch_workspaceId_launchId_key" ON "HealthEditionLaunch"("workspaceId", "launchId");
CREATE INDEX "HealthEditionLaunch_workspaceId_edition_idx" ON "HealthEditionLaunch"("workspaceId", "edition");

-- AddForeignKey
ALTER TABLE "HealthEditionEntitlement" ADD CONSTRAINT "HealthEditionEntitlement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthEditionRegulatory" ADD CONSTRAINT "HealthEditionRegulatory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthEditionAi" ADD CONSTRAINT "HealthEditionAi_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthEditionExchange" ADD CONSTRAINT "HealthEditionExchange_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthEditionLaunch" ADD CONSTRAINT "HealthEditionLaunch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
