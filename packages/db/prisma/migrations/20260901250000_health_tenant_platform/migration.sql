-- N0VA Tenant Configuration and Policy Control Plane — versioned,
-- immutable-after-approval configuration with explicit inheritance,
-- guardrailed domains, isolation tiers, and lifecycle operations.

-- CreateTable
CREATE TABLE "HealthTenantRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT '',
    "isolationTier" TEXT NOT NULL DEFAULT 'LOGICAL_SHARED',
    "orgStructure" JSONB NOT NULL DEFAULT '{}',
    "onboarding" JSONB NOT NULL DEFAULT '{}',
    "readiness" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'ONBOARDING',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthTenantRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthTenantConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '2026.09.1',
    "parentVersion" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveUntil" TIMESTAMP(3),
    "domains" JSONB NOT NULL DEFAULT '{}',
    "businessReason" TEXT NOT NULL DEFAULT '',
    "requester" TEXT NOT NULL DEFAULT '',
    "riskClassification" TEXT NOT NULL DEFAULT 'B_OPERATIONAL',
    "testEvidence" TEXT NOT NULL DEFAULT '',
    "rollbackVersion" TEXT NOT NULL DEFAULT '',
    "owner" TEXT NOT NULL DEFAULT '',
    "reviewDate" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthTenantConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthTenantAlertRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "alertRuleId" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "trigger" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "primaryRoute" TEXT NOT NULL DEFAULT '',
    "backupRoute" TEXT NOT NULL DEFAULT '',
    "acknowledgementDeadline" TEXT NOT NULL DEFAULT '',
    "escalation" TEXT[] NOT NULL DEFAULT '{}',
    "patientNotification" TEXT NOT NULL DEFAULT 'after_clinician_review',
    "duplicateWindow" TEXT NOT NULL DEFAULT '10_minutes',
    "approval" TEXT NOT NULL DEFAULT 'single',
    "cannotDisable" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthTenantAlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthTenantPathway" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "population" JSONB NOT NULL DEFAULT '{}',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "escalation" JSONB NOT NULL DEFAULT '{}',
    "safetyConstraints" TEXT[] NOT NULL DEFAULT '{}',
    "migrationPolicy" TEXT NOT NULL DEFAULT 'clinician_review',
    "approvedBy" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthTenantPathway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthTenantIntegration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "region" TEXT NOT NULL DEFAULT '',
    "protocol" TEXT NOT NULL DEFAULT '',
    "authentication" TEXT NOT NULL DEFAULT 'mutual_tls',
    "certificate" TEXT NOT NULL DEFAULT '',
    "allowedResources" TEXT[] NOT NULL DEFAULT '{}',
    "dataClassification" TEXT NOT NULL DEFAULT '',
    "messageMapping" TEXT NOT NULL DEFAULT '',
    "schemaVersion" TEXT NOT NULL DEFAULT '',
    "downtimeBehavior" TEXT NOT NULL DEFAULT 'queue_and_alert',
    "healthStatus" TEXT NOT NULL DEFAULT 'unknown',
    "expiresAt" TIMESTAMP(3),
    "vendorContact" TEXT NOT NULL DEFAULT '',
    "allowlisted" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthTenantIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthTenantDrift" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "driftId" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "runtimeValue" TEXT NOT NULL DEFAULT '',
    "approvedValue" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthTenantDrift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthTenantRecord_workspaceId_tenantId_key" ON "HealthTenantRecord"("workspaceId", "tenantId");
CREATE INDEX "HealthTenantRecord_workspaceId_status_idx" ON "HealthTenantRecord"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HealthTenantConfig_workspaceId_configId_key" ON "HealthTenantConfig"("workspaceId", "configId");
CREATE INDEX "HealthTenantConfig_workspaceId_tenantId_idx" ON "HealthTenantConfig"("workspaceId", "tenantId");
CREATE INDEX "HealthTenantConfig_workspaceId_status_idx" ON "HealthTenantConfig"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HealthTenantAlertRule_workspaceId_alertRuleId_version_key" ON "HealthTenantAlertRule"("workspaceId", "alertRuleId", "version");
CREATE INDEX "HealthTenantAlertRule_workspaceId_trigger_idx" ON "HealthTenantAlertRule"("workspaceId", "trigger");

-- CreateIndex
CREATE UNIQUE INDEX "HealthTenantPathway_workspaceId_pathwayId_version_key" ON "HealthTenantPathway"("workspaceId", "pathwayId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "HealthTenantIntegration_workspaceId_endpointId_key" ON "HealthTenantIntegration"("workspaceId", "endpointId");
CREATE INDEX "HealthTenantIntegration_workspaceId_tenantId_idx" ON "HealthTenantIntegration"("workspaceId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthTenantDrift_workspaceId_driftId_key" ON "HealthTenantDrift"("workspaceId", "driftId");
CREATE INDEX "HealthTenantDrift_workspaceId_status_idx" ON "HealthTenantDrift"("workspaceId", "status");

-- AddForeignKey
ALTER TABLE "HealthTenantRecord" ADD CONSTRAINT "HealthTenantRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthTenantConfig" ADD CONSTRAINT "HealthTenantConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthTenantAlertRule" ADD CONSTRAINT "HealthTenantAlertRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthTenantPathway" ADD CONSTRAINT "HealthTenantPathway_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthTenantIntegration" ADD CONSTRAINT "HealthTenantIntegration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthTenantDrift" ADD CONSTRAINT "HealthTenantDrift_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
