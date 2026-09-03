-- N0VA Care — clinic and distributed-care operating system.
-- Coordinated workspaces with provenance, governed med-rec, lifecycle-tracked
-- orders/results/tasks, program-managed RPM, classified CDS, safety controls.

-- CreateTable
CREATE TABLE "HealthCareEncounter" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientRef" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'access',
    "triageState" TEXT NOT NULL DEFAULT 'not_reviewed',
    "checklist" JSONB NOT NULL DEFAULT '{}',
    "documents" JSONB NOT NULL DEFAULT '[]',
    "attribution" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCareEncounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCareMedRec" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "patientRef" TEXT NOT NULL,
    "sources" TEXT[] NOT NULL DEFAULT '{}',
    "discrepancies" JSONB NOT NULL DEFAULT '[]',
    "approvedList" TEXT[] NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'sources_collected',
    "owner" TEXT NOT NULL DEFAULT '',
    "decisionHistory" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCareMedRec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCareOrder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "patientRef" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "urgency" TEXT NOT NULL DEFAULT 'routine',
    "receivingOrg" TEXT NOT NULL DEFAULT '',
    "owner" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'order_created',
    "authState" TEXT NOT NULL DEFAULT 'not_required',
    "deadlines" JSONB NOT NULL DEFAULT '{}',
    "reportReview" TEXT NOT NULL DEFAULT 'pending',
    "failureReason" TEXT NOT NULL DEFAULT '',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCareOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCareResult" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "patientRef" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'received',
    "owner" TEXT NOT NULL DEFAULT '',
    "ack" JSONB NOT NULL DEFAULT '{}',
    "payloadRef" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCareResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCareCoordTask" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "patientRef" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "owner" TEXT NOT NULL DEFAULT '',
    "backupOwner" TEXT NOT NULL DEFAULT '',
    "priority" TEXT NOT NULL DEFAULT 'routine',
    "dueAt" TIMESTAMP(3),
    "dependencies" TEXT[] NOT NULL DEFAULT '{}',
    "patientVisible" BOOLEAN NOT NULL DEFAULT true,
    "safetyCritical" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'open',
    "disposition" TEXT NOT NULL DEFAULT '',
    "escalation" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCareCoordTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCareRpm" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "patientRef" TEXT NOT NULL,
    "deviceRef" TEXT NOT NULL DEFAULT '',
    "consentRef" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'consented',
    "readings" JSONB NOT NULL DEFAULT '[]',
    "reviewer" TEXT NOT NULL DEFAULT '',
    "interventions" JSONB NOT NULL DEFAULT '[]',
    "exitReason" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCareRpm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCareMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "patientRef" TEXT NOT NULL DEFAULT '',
    "classification" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "owner" TEXT NOT NULL DEFAULT '',
    "priority" TEXT NOT NULL DEFAULT 'routine',
    "deadlineAt" TIMESTAMP(3),
    "aiInvolved" BOOLEAN NOT NULL DEFAULT false,
    "clinicianReviewed" BOOLEAN NOT NULL DEFAULT false,
    "senderLabel" TEXT NOT NULL DEFAULT '',
    "readState" TEXT NOT NULL DEFAULT 'unread',
    "ackState" TEXT NOT NULL DEFAULT 'unacknowledged',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCareMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCareCds" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "functionId" TEXT NOT NULL,
    "functionKey" TEXT NOT NULL,
    "intendedUse" TEXT NOT NULL DEFAULT '',
    "intendedUser" TEXT NOT NULL DEFAULT '',
    "inputs" TEXT[] NOT NULL DEFAULT '{}',
    "ruleVersion" TEXT NOT NULL DEFAULT '1.0',
    "evidence" TEXT NOT NULL DEFAULT '',
    "limitations" TEXT[] NOT NULL DEFAULT '{}',
    "regulatoryClass" TEXT NOT NULL DEFAULT '',
    "humanReview" TEXT NOT NULL DEFAULT 'required',
    "state" TEXT NOT NULL DEFAULT 'available',
    "interactions" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCareCds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCareSafety" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "safetyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "patientRef" TEXT NOT NULL DEFAULT '',
    "detail" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolution" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCareSafety_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthCareEncounter_workspaceId_encounterId_key" ON "HealthCareEncounter"("workspaceId", "encounterId");
CREATE INDEX "HealthCareEncounter_workspaceId_patientRef_idx" ON "HealthCareEncounter"("workspaceId", "patientRef");

-- CreateIndex
CREATE UNIQUE INDEX "HealthCareMedRec_workspaceId_sessionId_key" ON "HealthCareMedRec"("workspaceId", "sessionId");
CREATE INDEX "HealthCareMedRec_workspaceId_patientRef_idx" ON "HealthCareMedRec"("workspaceId", "patientRef");

-- CreateIndex
CREATE UNIQUE INDEX "HealthCareOrder_workspaceId_orderId_key" ON "HealthCareOrder"("workspaceId", "orderId");
CREATE INDEX "HealthCareOrder_workspaceId_patientRef_idx" ON "HealthCareOrder"("workspaceId", "patientRef");
CREATE INDEX "HealthCareOrder_workspaceId_status_idx" ON "HealthCareOrder"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HealthCareResult_workspaceId_resultId_key" ON "HealthCareResult"("workspaceId", "resultId");
CREATE INDEX "HealthCareResult_workspaceId_patientRef_idx" ON "HealthCareResult"("workspaceId", "patientRef");
CREATE INDEX "HealthCareResult_workspaceId_status_idx" ON "HealthCareResult"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HealthCareCoordTask_workspaceId_taskId_key" ON "HealthCareCoordTask"("workspaceId", "taskId");
CREATE INDEX "HealthCareCoordTask_workspaceId_patientRef_idx" ON "HealthCareCoordTask"("workspaceId", "patientRef");
CREATE INDEX "HealthCareCoordTask_workspaceId_status_idx" ON "HealthCareCoordTask"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HealthCareRpm_workspaceId_enrollmentId_key" ON "HealthCareRpm"("workspaceId", "enrollmentId");
CREATE INDEX "HealthCareRpm_workspaceId_patientRef_idx" ON "HealthCareRpm"("workspaceId", "patientRef");

-- CreateIndex
CREATE UNIQUE INDEX "HealthCareMessage_workspaceId_messageId_key" ON "HealthCareMessage"("workspaceId", "messageId");
CREATE INDEX "HealthCareMessage_workspaceId_patientRef_idx" ON "HealthCareMessage"("workspaceId", "patientRef");

-- CreateIndex
CREATE UNIQUE INDEX "HealthCareCds_workspaceId_functionId_key" ON "HealthCareCds"("workspaceId", "functionId");
CREATE INDEX "HealthCareCds_workspaceId_functionKey_idx" ON "HealthCareCds"("workspaceId", "functionKey");

-- CreateIndex
CREATE UNIQUE INDEX "HealthCareSafety_workspaceId_safetyId_key" ON "HealthCareSafety"("workspaceId", "safetyId");
CREATE INDEX "HealthCareSafety_workspaceId_kind_idx" ON "HealthCareSafety"("workspaceId", "kind");

-- AddForeignKey
ALTER TABLE "HealthCareEncounter" ADD CONSTRAINT "HealthCareEncounter_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCareMedRec" ADD CONSTRAINT "HealthCareMedRec_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCareOrder" ADD CONSTRAINT "HealthCareOrder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCareResult" ADD CONSTRAINT "HealthCareResult_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCareCoordTask" ADD CONSTRAINT "HealthCareCoordTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCareRpm" ADD CONSTRAINT "HealthCareRpm_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCareMessage" ADD CONSTRAINT "HealthCareMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCareCds" ADD CONSTRAINT "HealthCareCds_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCareSafety" ADD CONSTRAINT "HealthCareSafety_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
