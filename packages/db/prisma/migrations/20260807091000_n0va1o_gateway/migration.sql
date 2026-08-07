-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "integrationRetentionDays" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN "mcpKey" TEXT;

-- AlterTable
ALTER TABLE "Integration" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'other',
ADD COLUMN "mcpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "webhookEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "webhookSecret" TEXT,
ADD COLUMN "webhookPath" TEXT,
ADD COLUMN "rateLimitPerMin" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN "retryMax" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "timeoutMs" INTEGER NOT NULL DEFAULT 15000,
ADD COLUMN "allowlistTools" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "blocklistTools" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "IntegrationLog" ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'outbound',
ADD COLUMN "statusCode" INTEGER,
ADD COLUMN "durationMs" INTEGER,
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "method" TEXT,
ADD COLUMN "path" TEXT,
ADD COLUMN "meta" JSONB;

-- CreateIndex
CREATE INDEX "IntegrationLog_workspaceId_createdAt_idx" ON "IntegrationLog"("workspaceId", "createdAt" DESC);

-- CreateTable
CREATE TABLE "IntegrationAccessRequest" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requestedById" TEXT,
    "requesterLabel" TEXT NOT NULL DEFAULT 'mcp-agent',
    "tool" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationAccessRequest_workspaceId_status_createdAt_idx" ON "IntegrationAccessRequest"("workspaceId", "status", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "IntegrationAccessRequest" ADD CONSTRAINT "IntegrationAccessRequest_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationAccessRequest" ADD CONSTRAINT "IntegrationAccessRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;