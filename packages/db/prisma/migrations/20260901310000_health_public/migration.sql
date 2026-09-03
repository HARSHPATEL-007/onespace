-- N0VA Public Health — jurisdiction-aware population-health and emergency
-- coordination. Authority-gated actions, separated case/analytics/public
-- products, self-expiring emergency powers, transparent allocation.

-- CreateTable
CREATE TABLE "HealthPublicJurisdiction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "legalAuthority" TEXT NOT NULL DEFAULT '',
    "permittedPurposes" TEXT[] NOT NULL DEFAULT '{}',
    "dataScope" TEXT[] NOT NULL DEFAULT '{}',
    "geography" TEXT NOT NULL DEFAULT '',
    "emergencyMode" BOOLEAN NOT NULL DEFAULT false,
    "approvedPartners" TEXT[] NOT NULL DEFAULT '{}',
    "prohibitedPartners" TEXT[] NOT NULL DEFAULT '{}',
    "retention" TEXT NOT NULL DEFAULT 'configured-period',
    "reviewDate" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPublicJurisdiction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPublicSignal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "geography" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "quality" JSONB NOT NULL DEFAULT '{}',
    "baseline" TEXT NOT NULL DEFAULT '',
    "eventState" TEXT NOT NULL DEFAULT 'signal',
    "lifecycle" TEXT[] NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPublicSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPublicDashboard" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "geography" TEXT NOT NULL DEFAULT '',
    "period" TEXT NOT NULL DEFAULT '',
    "contract" JSONB NOT NULL DEFAULT '{}',
    "suppressedGroups" TEXT[] NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'published',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthPublicDashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPublicOutbreak" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "outbreakId" TEXT NOT NULL,
    "signalId" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL DEFAULT '',
    "stage" TEXT NOT NULL DEFAULT 'declaration',
    "caseDefinitions" JSONB NOT NULL DEFAULT '[]',
    "timeline" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPublicOutbreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPublicCase" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL DEFAULT '',
    "authorityRef" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL DEFAULT '',
    "patientRef" TEXT NOT NULL DEFAULT '',
    "stage" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPublicCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPublicImmunization" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "personRef" TEXT NOT NULL,
    "vaccine" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'unknown',
    "countable" TEXT NOT NULL DEFAULT 'unknown',
    "registryRef" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthPublicImmunization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPublicEmergency" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "emergencyId" TEXT NOT NULL,
    "incident" TEXT NOT NULL,
    "authority" TEXT NOT NULL DEFAULT '',
    "jurisdictions" TEXT[] NOT NULL DEFAULT '{}',
    "scope" TEXT NOT NULL DEFAULT '',
    "expiration" TIMESTAMP(3) NOT NULL,
    "commander" TEXT NOT NULL DEFAULT '',
    "partners" TEXT[] NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "reauthorizations" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPublicEmergency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPublicResource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "rules" JSONB NOT NULL DEFAULT '{}',
    "approver" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'allocated',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthPublicResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPublicMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "message" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'published',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthPublicMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPublicAgreement" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "parties" TEXT[] NOT NULL DEFAULT '{}',
    "legalAuthority" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL DEFAULT '',
    "dataElements" TEXT[] NOT NULL DEFAULT '{}',
    "fields" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPublicAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPublicAi" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "use" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL DEFAULT '',
    "population" TEXT NOT NULL DEFAULT '',
    "version" TEXT NOT NULL DEFAULT '1.0',
    "reviewer" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'registered',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPublicAi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthPublicJurisdiction_workspaceId_jurisdictionId_key" ON "HealthPublicJurisdiction"("workspaceId", "jurisdictionId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPublicSignal_workspaceId_signalId_key" ON "HealthPublicSignal"("workspaceId", "signalId");
CREATE INDEX "HealthPublicSignal_workspaceId_eventState_idx" ON "HealthPublicSignal"("workspaceId", "eventState");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPublicDashboard_workspaceId_dashboardId_key" ON "HealthPublicDashboard"("workspaceId", "dashboardId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPublicOutbreak_workspaceId_outbreakId_key" ON "HealthPublicOutbreak"("workspaceId", "outbreakId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPublicCase_workspaceId_caseId_key" ON "HealthPublicCase"("workspaceId", "caseId");
CREATE INDEX "HealthPublicCase_workspaceId_status_idx" ON "HealthPublicCase"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPublicImmunization_workspaceId_recordId_key" ON "HealthPublicImmunization"("workspaceId", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPublicEmergency_workspaceId_emergencyId_key" ON "HealthPublicEmergency"("workspaceId", "emergencyId");
CREATE INDEX "HealthPublicEmergency_workspaceId_status_idx" ON "HealthPublicEmergency"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPublicResource_workspaceId_allocationId_key" ON "HealthPublicResource"("workspaceId", "allocationId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPublicMessage_workspaceId_messageId_key" ON "HealthPublicMessage"("workspaceId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPublicAgreement_workspaceId_agreementId_key" ON "HealthPublicAgreement"("workspaceId", "agreementId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPublicAi_workspaceId_modelId_key" ON "HealthPublicAi"("workspaceId", "modelId");

-- AddForeignKey
ALTER TABLE "HealthPublicJurisdiction" ADD CONSTRAINT "HealthPublicJurisdiction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPublicSignal" ADD CONSTRAINT "HealthPublicSignal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPublicDashboard" ADD CONSTRAINT "HealthPublicDashboard_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPublicOutbreak" ADD CONSTRAINT "HealthPublicOutbreak_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPublicCase" ADD CONSTRAINT "HealthPublicCase_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPublicImmunization" ADD CONSTRAINT "HealthPublicImmunization_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPublicEmergency" ADD CONSTRAINT "HealthPublicEmergency_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPublicResource" ADD CONSTRAINT "HealthPublicResource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPublicMessage" ADD CONSTRAINT "HealthPublicMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPublicAgreement" ADD CONSTRAINT "HealthPublicAgreement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPublicAi" ADD CONSTRAINT "HealthPublicAi_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
