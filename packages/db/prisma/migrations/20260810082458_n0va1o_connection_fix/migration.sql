-- N0VA1O: Create missing IntegrationConnection table + enums + orphaned columns
-- This fixes the schema drift where Prisma models existed without corresponding DDL.

-- Create enum types for token/connection states
CREATE TYPE "TokenState" AS ENUM ('PROVISIONING', 'ACTIVE', 'REFRESHING', 'DEGRADED', 'FAILED', 'REVOKED');
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- Create IntegrationConnection table (was referenced by Prisma schema but never created)
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountLabel" TEXT,
    "authType" TEXT NOT NULL DEFAULT 'oauth2',
    "encryptedToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "allowedScopes" JSONB NOT NULL DEFAULT '[]',
    "allowedActions" JSONB NOT NULL DEFAULT '[]',
    "blockedActions" JSONB NOT NULL DEFAULT '[]',
    "tokenState" "TokenState" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "lastRefreshed" TIMESTAMP(3),
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "healthScore" FLOAT NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- Indexes for IntegrationConnection
CREATE INDEX "IntegrationConnection_integrationId_idx" ON "IntegrationConnection"("integrationId");
CREATE INDEX "IntegrationConnection_workspaceId_idx" ON "IntegrationConnection"("workspaceId");
CREATE INDEX "IntegrationConnection_integrationId_workspaceId_status_idx" ON "IntegrationConnection"("integrationId", "workspaceId", "status");
CREATE INDEX "IntegrationConnection_tokenState_idx" ON "IntegrationConnection"("tokenState");

-- Foreign keys
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_integrationId_fkey"
    FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add orphaned columns to IntegrationAccessRequest that exist in Prisma schema but not in DDL
ALTER TABLE "IntegrationAccessRequest" ADD COLUMN "toolArguments" JSONB;
ALTER TABLE "IntegrationAccessRequest" ADD COLUMN "reasoningChain" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "IntegrationAccessRequest" ADD COLUMN "sessionContext" JSONB;
ALTER TABLE "IntegrationAccessRequest" ADD COLUMN "approvedSignature" TEXT;

-- Add orphaned activeConnectionId column to Integration
ALTER TABLE "Integration" ADD COLUMN "activeConnectionId" TEXT;

-- Create access request status enum and migrate
CREATE TYPE "AccessRequestStatus_new" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED');
ALTER TABLE "IntegrationAccessRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "IntegrationAccessRequest" ALTER COLUMN "status" TYPE "AccessRequestStatus_new" USING "status"::text::"AccessRequestStatus_new";
ALTER TABLE "IntegrationAccessRequest" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"AccessRequestStatus_new";
DROP TYPE IF EXISTS "AccessRequestStatus";
ALTER TYPE "AccessRequestStatus_new" RENAME TO "AccessRequestStatus";

-- Index for active connection lookups
CREATE UNIQUE INDEX "Integration_activeConnectionId_key" ON "Integration"("activeConnectionId") WHERE "activeConnectionId" IS NOT NULL;
