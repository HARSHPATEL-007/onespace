-- Bot Automation Engine

DO $$ BEGIN CREATE TYPE "BotStatus" AS ENUM ('ACTIVE','PAUSED','DISABLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "BotTriggerType" AS ENUM ('SLASH_COMMAND','MENTION','WEBHOOK','SCHEDULED','AI_TRIGGER'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING','RUNNING','COMPLETED','FAILED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "WebhookDirection" AS ENUM ('INCOMING','OUTGOING'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE "Bot" (
    "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "createdById" TEXT NOT NULL, "name" TEXT NOT NULL, "avatarUrl" TEXT,
    "description" TEXT NOT NULL DEFAULT '', "persona" JSONB NOT NULL DEFAULT '{}', "knowledgeScopes" TEXT[] NOT NULL DEFAULT '{}',
    "permissions" JSONB NOT NULL DEFAULT '{}', "status" "BotStatus" NOT NULL DEFAULT 'ACTIVE', "rateLimitPerMin" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Bot_pkey" PRIMARY KEY ("id"));
CREATE INDEX "Bot_workspaceId_status_idx" ON "Bot"("workspaceId", "status");
ALTER TABLE "Bot" ADD CONSTRAINT "Bot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bot" ADD CONSTRAINT "Bot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BotTrigger" (
    "id" TEXT NOT NULL, "botId" TEXT NOT NULL, "type" "BotTriggerType" NOT NULL, "config" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BotTrigger_pkey" PRIMARY KEY ("id"));
CREATE INDEX "BotTrigger_botId_type_idx" ON "BotTrigger"("botId", "type");
ALTER TABLE "BotTrigger" ADD CONSTRAINT "BotTrigger_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BotExecution" (
    "id" TEXT NOT NULL, "botId" TEXT NOT NULL, "triggerId" TEXT, "triggerType" TEXT NOT NULL, "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB NOT NULL DEFAULT '{}', "status" "ExecutionStatus" NOT NULL DEFAULT 'PENDING', "durationMs" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BotExecution_pkey" PRIMARY KEY ("id"));
CREATE INDEX "BotExecution_botId_status_idx" ON "BotExecution"("botId", "status");
ALTER TABLE "BotExecution" ADD CONSTRAINT "BotExecution_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BotWebhook" (
    "id" TEXT NOT NULL, "botId" TEXT NOT NULL, "direction" "WebhookDirection" NOT NULL, "url" TEXT NOT NULL,
    "secret" TEXT, "events" TEXT[] NOT NULL DEFAULT '{}', "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "BotWebhook_pkey" PRIMARY KEY ("id"));
CREATE INDEX "BotWebhook_botId_direction_idx" ON "BotWebhook"("botId", "direction");
ALTER TABLE "BotWebhook" ADD CONSTRAINT "BotWebhook_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BotAuditLog" (
    "id" TEXT NOT NULL, "botId" TEXT NOT NULL, "action" TEXT NOT NULL, "actorId" TEXT, "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "BotAuditLog_pkey" PRIMARY KEY ("id"));
CREATE INDEX "BotAuditLog_botId_createdAt_idx" ON "BotAuditLog"("botId", "createdAt" DESC);
ALTER TABLE "BotAuditLog" ADD CONSTRAINT "BotAuditLog_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
