-- Unified Clinical Work-Queue & Inbox Orchestration — one role-aware work environment. FHIR Task abstraction.
-- Ingestion → Classification/safety → Dedup/link → Priority/SLA → Ownership/route → Work/delegate/escalate → Resolution → Audit/outcome/burden/quality.

-- CreateEnum
CREATE TYPE "WorkItemStatus" AS ENUM ('RECEIVED', 'CLASSIFIED', 'VALIDATED', 'ROUTED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'AWAITING_INFORMATION', 'AWAITING_EXTERNAL_PARTY', 'DELEGATED', 'ESCALATED', 'RESOLVED', 'CLOSED', 'DUPLICATE', 'RETRACTED', 'NOT_ACTIONABLE');

-- CreateEnum
CREATE TYPE "WorkItemPriority" AS ENUM ('STAT', 'URGENT', 'HIGH', 'ROUTINE', 'BATCH', 'INFORMATIONAL');

-- CreateTable
CREATE TABLE "HealthWorkItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "WorkItemStatus" NOT NULL DEFAULT 'RECEIVED',
    "priority" "WorkItemPriority" NOT NULL DEFAULT 'ROUTINE',
    "clinicalUrgency" TEXT,
    "clinicalPriority" TEXT,
    "adminPriority" TEXT,
    "actionability" TEXT,
    "owner" TEXT,
    "requestedPerformer" TEXT,
    "queue" TEXT NOT NULL,
    "sourceRef" TEXT,
    "relatedRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dueAt" TIMESTAMP(3),
    "slaPolicy" TEXT,
    "delegation" JSONB NOT NULL DEFAULT '{}',
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "patientVisibility" TEXT NOT NULL DEFAULT 'care_team_only',
    "auditRef" TEXT,
    "resolution" JSONB NOT NULL DEFAULT '{}',
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthWorkItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthWorkItemEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "owner" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthWorkItemEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthWorkQueuePolicy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "priority" "WorkItemPriority" NOT NULL,
    "ackMinutes" INTEGER NOT NULL,
    "resolveMinutes" INTEGER NOT NULL,
    "businessHours" JSONB NOT NULL DEFAULT '{}',
    "pauseConditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" TEXT NOT NULL DEFAULT 'v1',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthWorkQueuePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HealthWorkItem_workspaceId_queue_idx" ON "HealthWorkItem"("workspaceId", "queue");
CREATE INDEX "HealthWorkItem_workspaceId_status_idx" ON "HealthWorkItem"("workspaceId", "status");
CREATE INDEX "HealthWorkItem_workspaceId_priority_idx" ON "HealthWorkItem"("workspaceId", "priority");
CREATE INDEX "HealthWorkItem_workspaceId_patientId_idx" ON "HealthWorkItem"("workspaceId", "patientId");
CREATE INDEX "HealthWorkItem_owner_idx" ON "HealthWorkItem"("owner");
CREATE INDEX "HealthWorkItem_dueAt_idx" ON "HealthWorkItem"("dueAt");

-- CreateIndex
CREATE INDEX "HealthWorkItemEvent_workspaceId_workItemId_idx" ON "HealthWorkItemEvent"("workspaceId", "workItemId");
CREATE INDEX "HealthWorkItemEvent_workItemId_createdAt_idx" ON "HealthWorkItemEvent"("workItemId", "createdAt");
CREATE INDEX "HealthWorkItemEvent_action_idx" ON "HealthWorkItemEvent"("action");

-- CreateIndex
CREATE UNIQUE INDEX "HealthWorkQueuePolicy_workspaceId_queue_priority_version_key" ON "HealthWorkQueuePolicy"("workspaceId", "queue", "priority", "version");
CREATE INDEX "HealthWorkQueuePolicy_workspaceId_queue_idx" ON "HealthWorkQueuePolicy"("workspaceId", "queue");
CREATE INDEX "HealthWorkQueuePolicy_active_idx" ON "HealthWorkQueuePolicy"("active");

-- AddForeignKey
ALTER TABLE "HealthWorkItem" ADD CONSTRAINT "HealthWorkItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthWorkItem" ADD CONSTRAINT "HealthWorkItem_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthWorkItemEvent" ADD CONSTRAINT "HealthWorkItemEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthWorkItemEvent" ADD CONSTRAINT "HealthWorkItemEvent_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "HealthWorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthWorkQueuePolicy" ADD CONSTRAINT "HealthWorkQueuePolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
