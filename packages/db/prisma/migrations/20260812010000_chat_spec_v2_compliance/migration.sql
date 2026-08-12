-- Chat spec v2: compliance, governance, and security layer

ALTER TABLE "ChatChannel" ADD COLUMN "classification" TEXT;
ALTER TABLE "ChatChannel" ADD COLUMN "retentionTier" TEXT;

DO $$ BEGIN CREATE TYPE "ChatArtifactType" AS ENUM ('MESSAGE','FILE','EXPORT','AI_ARTIFACT'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ChatRetentionTier" AS ENUM ('STANDARD','EXTENDED','COMPLIANCE','GOVERNANCE','BLOCKCHAIN','LEGAL_HOLD'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ChatGovernanceRole" AS ENUM ('COMPLIANCE_OFFICER','SECURITY_ADMIN','LEGAL_ADMIN','AUDITOR','GUEST'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ChatApprovalAction" AS ENUM ('LOWER_RETENTION','REMOVE_LEGAL_HOLD','EXPORT_CONFIDENTIAL','DISABLE_WATERMARK','GRANT_TENANT_ACCESS'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ChatApprovalStatus" AS ENUM ('PENDING','APPROVED','REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ChatKeyPurpose" AS ENUM ('PRODUCTION','BACKUP','LEGAL_HOLD_VAULT'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE "ChatComplianceRecord" (
    "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "objectType" "ChatArtifactType" NOT NULL, "objectId" TEXT NOT NULL,
    "classification" TEXT NOT NULL DEFAULT '', "classificationSource" TEXT NOT NULL DEFAULT 'AUTO',
    "retentionMode" "ChatRetentionTier" NOT NULL DEFAULT 'STANDARD', "retainUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false, "legalHoldReason" TEXT,
    "watermarkEnabled" BOOLEAN NOT NULL DEFAULT true, "watermarkStyle" TEXT NOT NULL DEFAULT 'DYNAMIC',
    "watermarkViewerScope" TEXT NOT NULL DEFAULT 'USER_TIMESTAMP_VERSION',
    "encAlgorithm" TEXT NOT NULL DEFAULT 'AES-256-GCM', "keySource" TEXT NOT NULL DEFAULT 'HSM',
    "keyVersion" TEXT, "algTag" TEXT, "pqReady" BOOLEAN NOT NULL DEFAULT false, "pqRequired" BOOLEAN NOT NULL DEFAULT false,
    "contentHash" TEXT, "chainPrev" TEXT, "chainIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatComplianceRecord_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "ChatComplianceRecord_objectType_objectId_key" ON "ChatComplianceRecord"("objectType", "objectId");
CREATE INDEX "ChatComplianceRecord_workspaceId_retentionMode_idx" ON "ChatComplianceRecord"("workspaceId", "retentionMode");
CREATE INDEX "ChatComplianceRecord_workspaceId_legalHold_idx" ON "ChatComplianceRecord"("workspaceId", "legalHold");
ALTER TABLE "ChatComplianceRecord" ADD CONSTRAINT "ChatComplianceRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChatRetentionPolicy" (
    "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL,
    "tier" "ChatRetentionTier" NOT NULL, "scope" "ChatArtifactType" NOT NULL,
    "durationDays" INTEGER, "anchor" TEXT NOT NULL DEFAULT 'CREATION', "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatRetentionPolicy_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "ChatRetentionPolicy_workspaceId_tier_scope_key" ON "ChatRetentionPolicy"("workspaceId", "tier", "scope");
ALTER TABLE "ChatRetentionPolicy" ADD CONSTRAINT "ChatRetentionPolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChatAuditLog" (
    "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "actorId" TEXT NOT NULL, "actorName" TEXT,
    "action" TEXT NOT NULL, "objectType" TEXT, "objectId" TEXT, "channelId" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'SUCCESS', "policyApplied" TEXT, "ip" TEXT, "userAgent" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}', "hash" TEXT NOT NULL, "chainPrev" TEXT,
    "chainIndex" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatAuditLog_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ChatAuditLog_workspaceId_createdAt_idx" ON "ChatAuditLog"("workspaceId", "createdAt" DESC);
CREATE INDEX "ChatAuditLog_objectId_idx" ON "ChatAuditLog"("objectId");
ALTER TABLE "ChatAuditLog" ADD CONSTRAINT "ChatAuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChatLegalHold" (
    "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "scope" TEXT NOT NULL,
    "objectType" "ChatArtifactType", "objectId" TEXT, "reason" TEXT NOT NULL,
    "placedBy" TEXT NOT NULL, "placedById" TEXT NOT NULL, "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedBy" TEXT, "releasedById" TEXT, "releasedAt" TIMESTAMP(3), "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ChatLegalHold_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ChatLegalHold_workspaceId_active_idx" ON "ChatLegalHold"("workspaceId", "active");
ALTER TABLE "ChatLegalHold" ADD CONSTRAINT "ChatLegalHold_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChatApproval" (
    "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "action" "ChatApprovalAction" NOT NULL,
    "objectId" TEXT, "objectType" "ChatArtifactType", "rationale" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL, "status" "ChatApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT, "reviewedAt" TIMESTAMP(3), "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatApproval_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ChatApproval_workspaceId_status_idx" ON "ChatApproval"("workspaceId", "status");
ALTER TABLE "ChatApproval" ADD CONSTRAINT "ChatApproval_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatApproval" ADD CONSTRAINT "ChatApproval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatApproval" ADD CONSTRAINT "ChatApproval_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ChatGovernanceAssignment" (
    "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL,
    "role" "ChatGovernanceRole" NOT NULL, "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatGovernanceAssignment_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "ChatGovernanceAssignment_workspaceId_userId_key" ON "ChatGovernanceAssignment"("workspaceId", "userId");
ALTER TABLE "ChatGovernanceAssignment" ADD CONSTRAINT "ChatGovernanceAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatGovernanceAssignment" ADD CONSTRAINT "ChatGovernanceAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChatComplianceConfig" (
    "workspaceId" TEXT NOT NULL, "watermarkEnabled" BOOLEAN NOT NULL DEFAULT true,
    "watermarkStyle" TEXT NOT NULL DEFAULT 'DYNAMIC', "watermarkViewerScope" TEXT NOT NULL DEFAULT 'USER_TIMESTAMP_VERSION',
    "externalStronger" BOOLEAN NOT NULL DEFAULT true, "pqRequired" BOOLEAN NOT NULL DEFAULT false,
    "exportRedaction" BOOLEAN NOT NULL DEFAULT true, "derivedPropagation" BOOLEAN NOT NULL DEFAULT true,
    "keyRotationDays" INTEGER NOT NULL DEFAULT 180, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatComplianceConfig_pkey" PRIMARY KEY ("workspaceId"));
ALTER TABLE "ChatComplianceConfig" ADD CONSTRAINT "ChatComplianceConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChatKeyRecord" (
    "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "purpose" "ChatKeyPurpose" NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'AES-256-GCM', "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "wrappedKey" TEXT NOT NULL, "iv" TEXT NOT NULL, "tag" TEXT NOT NULL,
    "masterKeyVersion" INTEGER NOT NULL DEFAULT 1, "pqReady" BOOLEAN NOT NULL DEFAULT false,
    "pqRequired" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),
    CONSTRAINT "ChatKeyRecord_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "ChatKeyRecord_workspaceId_purpose_key" ON "ChatKeyRecord"("workspaceId", "purpose");
ALTER TABLE "ChatKeyRecord" ADD CONSTRAINT "ChatKeyRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
