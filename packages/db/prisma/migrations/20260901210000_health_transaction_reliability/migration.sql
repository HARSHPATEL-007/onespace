-- Healthcare Transaction Reliability Layer — cross-module operations stay safe when services fail,
-- messages duplicate, networks break, or humans must intervene. Visible states, never hidden details.
-- Local transactions + durable events + idempotent participants + compensation + gates + reconciliation.

-- CreateEnum
CREATE TYPE "TxnSagaStatus" AS ENUM ('RECEIVED', 'VALIDATING', 'AWAITING_AUTHORIZATION', 'AWAITING_PATIENT_CONFIRMATION', 'ACCEPTED', 'IN_PROGRESS', 'PARTIALLY_COMPLETED', 'AWAITING_DEPENDENCY', 'AWAITING_HUMAN_REVIEW', 'COMPENSATING', 'RECONCILIATION_REQUIRED', 'COMPLETED', 'COMPLETED_WITH_EXCEPTION', 'FAILED_SAFELY', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TxnStepStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'RETRYING', 'AWAITING_CHECKPOINT', 'COMPENSATED', 'SKIPPED', 'NOT_STARTED', 'UNKNOWN_OUTCOME');

-- CreateEnum
CREATE TYPE "TxnOutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "TxnInboxStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TxnCheckpointDecision" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TxnCompensationKind" AS ENUM ('TECHNICAL_UNDO', 'CLINICAL_CORRECTION', 'PATIENT_NOTIFICATION', 'ADMINISTRATIVE_CORRECTION', 'FORWARD_RECOVERY');

-- CreateEnum
CREATE TYPE "TxnCompensationStatus" AS ENUM ('PLANNED', 'EXECUTING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TxnDlqStatus" AS ENUM ('OPEN', 'ASSIGNED', 'DRY_RUN', 'REDRIVEN', 'RESOLVED', 'EXPIRED');

-- CreateTable
CREATE TABLE "HealthTxnSaga" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sagaId" TEXT NOT NULL,
    "commandType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "patientId" TEXT,
    "initiator" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'care_delivery',
    "priority" TEXT NOT NULL DEFAULT 'routine',
    "status" "TxnSagaStatus" NOT NULL DEFAULT 'RECEIVED',
    "currentStep" TEXT,
    "deadline" TIMESTAMP(3),
    "owner" TEXT,
    "lastError" TEXT,
    "auditRef" TEXT,
    "consentRef" TEXT,
    "correlationId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthTxnSaga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthTxnStep" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sagaId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'local_action',
    "status" "TxnStepStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "owner" TEXT,
    "result" JSONB NOT NULL DEFAULT '{}',
    "compensationFor" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthTxnStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthTxnCommand" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "commandType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "actor" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "response" JSONB NOT NULL DEFAULT '{}',
    "resultRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'accepted',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthTxnCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthTxnOutbox" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0',
    "causationId" TEXT,
    "correlationId" TEXT,
    "sagaId" TEXT,
    "status" "TxnOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "payloadHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthTxnOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthTxnInbox" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "consumer" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventHash" TEXT,
    "status" "TxnInboxStatus" NOT NULL DEFAULT 'RECEIVED',
    "resultRef" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthTxnInbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthTxnEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0',
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "patientId" TEXT,
    "actor" TEXT,
    "sagaId" TEXT,
    "causationId" TEXT,
    "correlationId" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'clinical_care',
    "consentRef" TEXT,
    "source" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "payloadHash" TEXT,
    "previousHash" TEXT,
    "signature" TEXT,
    "dataClassification" TEXT NOT NULL DEFAULT 'phi',
    "retentionClass" TEXT NOT NULL DEFAULT 'clinical',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthTxnEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthTxnCheckpoint" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sagaId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "requiredRole" TEXT NOT NULL,
    "fallbackRole" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "decision" "TxnCheckpointDecision" NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "auditRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthTxnCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthTxnCompensation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sagaId" TEXT NOT NULL,
    "stepId" TEXT,
    "kind" "TxnCompensationKind" NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "status" "TxnCompensationStatus" NOT NULL DEFAULT 'PLANNED',
    "owner" TEXT,
    "auditRef" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthTxnCompensation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthTxnDlq" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "eventRef" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "reason" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'routine',
    "owner" TEXT,
    "sla" TEXT,
    "status" "TxnDlqStatus" NOT NULL DEFAULT 'OPEN',
    "redriveCount" INTEGER NOT NULL DEFAULT 0,
    "lastRedrive" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthTxnDlq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthTxnReconciliation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "findings" JSONB NOT NULL DEFAULT '[]',
    "resolved" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthTxnReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthTxnDependency" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "required" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "optional" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "degradedModes" JSONB NOT NULL DEFAULT '{}',
    "emergencyFallback" TEXT,
    "cacheable" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxStaleTime" TEXT,
    "humanFallback" TEXT,
    "recoveryAction" TEXT,
    "patientMessage" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthTxnDependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthTxnSaga_workspaceId_sagaId_key" ON "HealthTxnSaga"("workspaceId", "sagaId");
CREATE INDEX "HealthTxnSaga_workspaceId_status_idx" ON "HealthTxnSaga"("workspaceId", "status");
CREATE INDEX "HealthTxnSaga_workspaceId_commandType_idx" ON "HealthTxnSaga"("workspaceId", "commandType");
CREATE INDEX "HealthTxnSaga_workspaceId_patientId_idx" ON "HealthTxnSaga"("workspaceId", "patientId");
CREATE INDEX "HealthTxnSaga_workspaceId_aggregate_idx" ON "HealthTxnSaga"("workspaceId", "aggregateType", "aggregateId");
CREATE INDEX "HealthTxnSaga_deadline_idx" ON "HealthTxnSaga"("deadline");

-- CreateIndex
CREATE UNIQUE INDEX "HealthTxnStep_sagaId_seq_key" ON "HealthTxnStep"("sagaId", "seq");
CREATE INDEX "HealthTxnStep_workspaceId_sagaId_idx" ON "HealthTxnStep"("workspaceId", "sagaId");
CREATE INDEX "HealthTxnStep_workspaceId_status_idx" ON "HealthTxnStep"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HealthTxnCommand_workspaceId_idempotencyKey_key" ON "HealthTxnCommand"("workspaceId", "idempotencyKey");
CREATE INDEX "HealthTxnCommand_workspaceId_commandType_idx" ON "HealthTxnCommand"("workspaceId", "commandType");
CREATE INDEX "HealthTxnCommand_workspaceId_aggregate_idx" ON "HealthTxnCommand"("workspaceId", "aggregateType", "aggregateId");
CREATE INDEX "HealthTxnCommand_expiresAt_idx" ON "HealthTxnCommand"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "HealthTxnOutbox_workspaceId_eventId_key" ON "HealthTxnOutbox"("workspaceId", "eventId");
CREATE INDEX "HealthTxnOutbox_workspaceId_status_idx" ON "HealthTxnOutbox"("workspaceId", "status");
CREATE INDEX "HealthTxnOutbox_workspaceId_aggregate_idx" ON "HealthTxnOutbox"("workspaceId", "aggregateType", "aggregateId");
CREATE INDEX "HealthTxnOutbox_nextAttemptAt_idx" ON "HealthTxnOutbox"("nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "HealthTxnInbox_workspaceId_consumer_eventId_key" ON "HealthTxnInbox"("workspaceId", "consumer", "eventId");
CREATE INDEX "HealthTxnInbox_workspaceId_consumer_idx" ON "HealthTxnInbox"("workspaceId", "consumer");
CREATE INDEX "HealthTxnInbox_workspaceId_status_idx" ON "HealthTxnInbox"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HealthTxnEvent_workspaceId_eventId_key" ON "HealthTxnEvent"("workspaceId", "eventId");
CREATE INDEX "HealthTxnEvent_workspaceId_aggregate_idx" ON "HealthTxnEvent"("workspaceId", "aggregateType", "aggregateId");
CREATE INDEX "HealthTxnEvent_workspaceId_sagaId_idx" ON "HealthTxnEvent"("workspaceId", "sagaId");
CREATE INDEX "HealthTxnEvent_workspaceId_patientId_idx" ON "HealthTxnEvent"("workspaceId", "patientId");
CREATE INDEX "HealthTxnEvent_workspaceId_eventType_idx" ON "HealthTxnEvent"("workspaceId", "eventType");
CREATE INDEX "HealthTxnEvent_createdAt_idx" ON "HealthTxnEvent"("createdAt");

-- CreateIndex
CREATE INDEX "HealthTxnCheckpoint_workspaceId_sagaId_idx" ON "HealthTxnCheckpoint"("workspaceId", "sagaId");
CREATE INDEX "HealthTxnCheckpoint_workspaceId_decision_idx" ON "HealthTxnCheckpoint"("workspaceId", "decision");
CREATE INDEX "HealthTxnCheckpoint_expiresAt_idx" ON "HealthTxnCheckpoint"("expiresAt");

-- CreateIndex
CREATE INDEX "HealthTxnCompensation_workspaceId_sagaId_idx" ON "HealthTxnCompensation"("workspaceId", "sagaId");
CREATE INDEX "HealthTxnCompensation_workspaceId_status_idx" ON "HealthTxnCompensation"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "HealthTxnDlq_workspaceId_status_idx" ON "HealthTxnDlq"("workspaceId", "status");
CREATE INDEX "HealthTxnDlq_workspaceId_category_idx" ON "HealthTxnDlq"("workspaceId", "category");
CREATE INDEX "HealthTxnDlq_workspaceId_priority_idx" ON "HealthTxnDlq"("workspaceId", "priority");

-- CreateIndex
CREATE INDEX "HealthTxnReconciliation_workspaceId_status_idx" ON "HealthTxnReconciliation"("workspaceId", "status");
CREATE INDEX "HealthTxnReconciliation_workspaceId_scope_idx" ON "HealthTxnReconciliation"("workspaceId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "HealthTxnDependency_workspaceId_module_key" ON "HealthTxnDependency"("workspaceId", "module");
CREATE INDEX "HealthTxnDependency_workspaceId_active_idx" ON "HealthTxnDependency"("workspaceId", "active");

-- AddForeignKey
ALTER TABLE "HealthTxnSaga" ADD CONSTRAINT "HealthTxnSaga_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthTxnSaga" ADD CONSTRAINT "HealthTxnSaga_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthTxnStep" ADD CONSTRAINT "HealthTxnStep_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthTxnStep" ADD CONSTRAINT "HealthTxnStep_sagaId_fkey" FOREIGN KEY ("sagaId") REFERENCES "HealthTxnSaga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthTxnCommand" ADD CONSTRAINT "HealthTxnCommand_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthTxnOutbox" ADD CONSTRAINT "HealthTxnOutbox_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthTxnInbox" ADD CONSTRAINT "HealthTxnInbox_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthTxnEvent" ADD CONSTRAINT "HealthTxnEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthTxnEvent" ADD CONSTRAINT "HealthTxnEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthTxnCheckpoint" ADD CONSTRAINT "HealthTxnCheckpoint_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthTxnCheckpoint" ADD CONSTRAINT "HealthTxnCheckpoint_sagaId_fkey" FOREIGN KEY ("sagaId") REFERENCES "HealthTxnSaga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthTxnCompensation" ADD CONSTRAINT "HealthTxnCompensation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthTxnCompensation" ADD CONSTRAINT "HealthTxnCompensation_sagaId_fkey" FOREIGN KEY ("sagaId") REFERENCES "HealthTxnSaga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthTxnDlq" ADD CONSTRAINT "HealthTxnDlq_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthTxnReconciliation" ADD CONSTRAINT "HealthTxnReconciliation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthTxnDependency" ADD CONSTRAINT "HealthTxnDependency_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
