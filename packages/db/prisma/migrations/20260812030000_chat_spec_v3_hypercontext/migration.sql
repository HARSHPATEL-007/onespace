-- Chat SPEC v3 — Hyper-context: link suggestions, proposals, transactional outbox, compensation log, policy config.

CREATE TABLE "ChatHyperContext" (
    "messageId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "threadId" TEXT,
    "causalChain" JSONB NOT NULL DEFAULT '[]',
    "links" JSONB NOT NULL DEFAULT '[]',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatHyperContext_pkey" PRIMARY KEY ("messageId")
);

CREATE TABLE "ChatLinkSuggestion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'AUTO',
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "reweight" DOUBLE PRECISION,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatLinkSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatTaskProposal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "dueDate" TIMESTAMP(3),
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "sourceQuote" TEXT NOT NULL,
    "linkedEntities" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "confidence" DOUBLE PRECISION NOT NULL,
    "externalTaskId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatTaskProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatEventProposal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "attendeeUserIds" JSONB NOT NULL DEFAULT '[]',
    "agendaDraft" TEXT NOT NULL DEFAULT '',
    "suggestedRoom" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "linkedMeetingId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatEventProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatApprovalRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "approverUserId" TEXT,
    "requiredEvidence" JSONB NOT NULL DEFAULT '[]',
    "linkedObjectIds" JSONB NOT NULL DEFAULT '[]',
    "rationale" TEXT NOT NULL,
    "amount" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "deadline" TIMESTAMP(3),
    "governanceApprovalId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatOutboxEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT,
    "actionType" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "causeEventId" TEXT,
    "error" TEXT,
    "causalOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ChatOutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatCompensationLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "outboxEventId" TEXT,
    "step" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "compensatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatCompensationLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatHyperConfig" (
    "workspaceId" TEXT NOT NULL,
    "autoCreateTasks" BOOLEAN NOT NULL DEFAULT true,
    "taskConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "autoCreateEvents" BOOLEAN NOT NULL DEFAULT true,
    "eventConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "autoRaiseApprovals" BOOLEAN NOT NULL DEFAULT false,
    "approvalConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "maxLinks" INTEGER NOT NULL DEFAULT 12,
    "notifyOnAutoCreate" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatHyperConfig_pkey" PRIMARY KEY ("workspaceId")
);

CREATE INDEX "ChatHyperContext_workspaceId_idx" ON "ChatHyperContext"("workspaceId");
CREATE INDEX "ChatHyperContext_threadId_idx" ON "ChatHyperContext"("threadId");
CREATE INDEX "ChatLinkSuggestion_workspaceId_messageId_idx" ON "ChatLinkSuggestion"("workspaceId", "messageId");
CREATE INDEX "ChatTaskProposal_workspaceId_status_idx" ON "ChatTaskProposal"("workspaceId", "status");
CREATE INDEX "ChatEventProposal_workspaceId_status_idx" ON "ChatEventProposal"("workspaceId", "status");
CREATE INDEX "ChatApprovalRequest_workspaceId_status_idx" ON "ChatApprovalRequest"("workspaceId", "status");
CREATE INDEX "ChatOutboxEvent_workspaceId_status_idx" ON "ChatOutboxEvent"("workspaceId", "status");
CREATE UNIQUE INDEX "ChatOutboxEvent_idempotencyKey_key" ON "ChatOutboxEvent"("idempotencyKey");

ALTER TABLE "ChatHyperContext" ADD CONSTRAINT "ChatHyperContext_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatLinkSuggestion" ADD CONSTRAINT "ChatLinkSuggestion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatTaskProposal" ADD CONSTRAINT "ChatTaskProposal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatEventProposal" ADD CONSTRAINT "ChatEventProposal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatApprovalRequest" ADD CONSTRAINT "ChatApprovalRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatOutboxEvent" ADD CONSTRAINT "ChatOutboxEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatCompensationLog" ADD CONSTRAINT "ChatCompensationLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatHyperConfig" ADD CONSTRAINT "ChatHyperConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
