-- N0VA BOOKLM+EDUCATION Multi-Agent Tutor: registry, tasks, events, snapshots, escalations

DO $$ BEGIN CREATE TYPE "AgentTaskStatus" AS ENUM ('REQUESTED', 'RUNNING', 'COMPLETED', 'FAILED', 'DEGRADED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "EscalationStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "TutorSession" ADD COLUMN IF NOT EXISTS "intent" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TutorSession" ADD COLUMN IF NOT EXISTS "plan" JSONB;
ALTER TABLE "TutorSession" ADD COLUMN IF NOT EXISTS "degraded" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "TutorAgent" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL,
  "key" TEXT NOT NULL, "name" TEXT NOT NULL, "mandate" TEXT NOT NULL DEFAULT '',
  "tools" TEXT[] NOT NULL DEFAULT '{}', "version" TEXT NOT NULL DEFAULT '1.0',
  "confidenceLimit" DOUBLE PRECISION NOT NULL DEFAULT 0.45,
  "allowedActions" TEXT[] NOT NULL DEFAULT '{}', "dataScopes" TEXT[] NOT NULL DEFAULT '{}',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TutorAgent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TutorAgent_workspaceId_key_key" ON "TutorAgent"("workspaceId", "key");

CREATE TABLE IF NOT EXISTS "AgentTask" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "sessionId" TEXT NOT NULL,
  "agentKey" TEXT NOT NULL, "intent" TEXT NOT NULL DEFAULT '',
  "target" JSONB, "constraints" JSONB,
  "status" "AgentTaskStatus" NOT NULL DEFAULT 'REQUESTED',
  "artifacts" JSONB, "claims" JSONB, "proposals" JSONB,
  "warnings" TEXT[] NOT NULL DEFAULT '{}', "nextActions" TEXT[] NOT NULL DEFAULT '{}',
  "modelVersion" TEXT NOT NULL DEFAULT '', "latencyMs" INTEGER, "error" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AgentTask_workspaceId_sessionId_idx" ON "AgentTask"("workspaceId", "sessionId");
CREATE INDEX IF NOT EXISTS "AgentTask_workspaceId_agentKey_idx" ON "AgentTask"("workspaceId", "agentKey");

CREATE TABLE IF NOT EXISTS "AgentEvent" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "taskId" TEXT,
  "type" TEXT NOT NULL, "payload" JSONB, "actor" TEXT NOT NULL DEFAULT 'orchestrator',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AgentEvent_workspaceId_sessionId_createdAt_idx" ON "AgentEvent"("workspaceId", "sessionId", "createdAt");

CREATE TABLE IF NOT EXISTS "StateSnapshot" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "state" JSONB NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StateSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StateSnapshot_workspaceId_sessionId_version_idx" ON "StateSnapshot"("workspaceId", "sessionId", "version");

CREATE TABLE IF NOT EXISTS "Escalation" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "sessionId" TEXT, "setId" TEXT, "userId" TEXT NOT NULL,
  "topic" TEXT NOT NULL DEFAULT '', "issue" TEXT NOT NULL,
  "evidence" TEXT[] NOT NULL DEFAULT '{}', "disagreement" JSONB,
  "recommendation" TEXT NOT NULL DEFAULT '', "learnerVisible" BOOLEAN NOT NULL DEFAULT true,
  "urgency" TEXT NOT NULL DEFAULT 'normal', "status" "EscalationStatus" NOT NULL DEFAULT 'OPEN',
  "resolution" TEXT NOT NULL DEFAULT '', "resolvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Escalation_workspaceId_status_idx" ON "Escalation"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "Escalation_workspaceId_userId_idx" ON "Escalation"("workspaceId", "userId");
