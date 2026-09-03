-- Interoperability Control Plane — dedicated layer between external systems and the clinical data platform.
-- Raw immutable landing zone → parsing/normalization → terminology → validation → dedup/conflict → quarantine-or-ingest.
-- Raw payloads never overwritten: reproducibility, investigation, safe replay.

-- CreateEnum
CREATE TYPE "InteropProtocol" AS ENUM ('FHIR_R4', 'FHIR_R5', 'HL7_V2', 'DICOM_DIMSE', 'DICOMWEB', 'PHARMACY_FEED', 'CLAIMS_FEED', 'DEVICE', 'RESEARCH');

-- CreateEnum
CREATE TYPE "InteropMessageStatus" AS ENUM ('RECEIVED', 'FRAME_VALIDATED', 'PERSISTED', 'ACKED', 'PARSED', 'PROFILE_VALIDATED', 'IDENTITY_RESOLVED', 'TERMINOLOGY_MAPPED', 'DEDUPED', 'BUSINESS_VALIDATED', 'NORMALIZED', 'INGESTED', 'QUARANTINED', 'SUPERSEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "InteropValidationOutcome" AS ENUM ('VALID', 'VALID_WITH_WARNING', 'REPAIRABLE', 'QUARANTINE', 'UNSUPPORTED_VERSION', 'UNKNOWN_PROFILE', 'TERMINOLOGY_UNRESOLVED', 'IDENTITY_UNRESOLVED', 'DUPLICATE_CANDIDATE', 'CONFLICT_REVIEW');

-- CreateEnum
CREATE TYPE "InteropQuarantineStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RELEASED', 'RESOLVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InteropConflictStatus" AS ENUM ('OPEN', 'SOURCE_PRECEDENCE', 'HUMAN_MERGED', 'PRESERVED_BOTH', 'SUPERSEDED', 'INVALID_SOURCE', 'PATIENT_CORRECTED', 'UNRESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "InteropReplayStatus" AS ENUM ('DRAFT', 'PREVIEWED', 'APPROVED', 'RUNNING', 'COMPLETED', 'PARTIAL_FAILURE', 'ROLLED_BACK', 'BLOCKED');

-- CreateEnum
CREATE TYPE "InteropConformanceStatus" AS ENUM ('PASS', 'CONDITIONAL_PASS', 'FAIL', 'NOT_TESTED', 'UNSUPPORTED', 'DEGRADED', 'EXPIRED');

-- CreateTable
CREATE TABLE "InteropInterface" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "interfaceId" TEXT NOT NULL,
    "partner" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "protocol" "InteropProtocol" NOT NULL,
    "version" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'inbound',
    "endpoint" TEXT,
    "resources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "profilePackages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "terminology" JSONB NOT NULL DEFAULT '{}',
    "security" JSONB NOT NULL DEFAULT '{}',
    "limits" JSONB NOT NULL DEFAULT '{}',
    "retry" JSONB NOT NULL DEFAULT '{}',
    "maintenance" JSONB NOT NULL DEFAULT '{}',
    "sla" TEXT,
    "supportContact" TEXT,
    "dataUsePurpose" TEXT,
    "retention" TEXT,
    "conformanceStatus" "InteropConformanceStatus" NOT NULL DEFAULT 'NOT_TESTED',
    "deprecationDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "owner" TEXT,
    "lastContractTest" TIMESTAMP(3),
    "nextReview" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteropInterface_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteropMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "interfaceId" TEXT,
    "protocol" "InteropProtocol" NOT NULL,
    "messageType" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'inbound',
    "rawPayload" TEXT NOT NULL,
    "rawHash" TEXT NOT NULL,
    "patientId" TEXT,
    "status" "InteropMessageStatus" NOT NULL DEFAULT 'RECEIVED',
    "validationOutcome" "InteropValidationOutcome",
    "normalizedRef" TEXT,
    "ackCode" TEXT,
    "ackAt" TIMESTAMP(3),
    "dedupKey" TEXT,
    "idempotencyKey" TEXT,
    "errorDetail" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteropMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteropValidation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "outcome" "InteropValidationOutcome" NOT NULL,
    "stages" JSONB NOT NULL DEFAULT '[]',
    "issues" JSONB NOT NULL DEFAULT '[]',
    "mappingVersion" TEXT,
    "profile" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteropValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteropMapping" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceResource" TEXT NOT NULL,
    "sourceVersion" TEXT,
    "targetResource" TEXT NOT NULL,
    "targetVersion" TEXT,
    "profile" TEXT,
    "fieldMappings" JSONB NOT NULL DEFAULT '[]',
    "terminologyVersion" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteropMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteropTerminologyMap" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "targetSystem" TEXT NOT NULL,
    "targetCode" TEXT,
    "mappingType" TEXT NOT NULL DEFAULT 'possible',
    "confidence" TEXT NOT NULL DEFAULT 'low',
    "mappingVersion" TEXT NOT NULL DEFAULT '2026.08',
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteropTerminologyMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteropQuarantine" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'high',
    "owner" TEXT,
    "sla" TEXT,
    "downstreamBlocked" BOOLEAN NOT NULL DEFAULT true,
    "retryAllowed" BOOLEAN NOT NULL DEFAULT false,
    "status" "InteropQuarantineStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" JSONB NOT NULL DEFAULT '{}',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteropQuarantine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteropConflict" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recordRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "patientId" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'clinical_review_required',
    "automaticResolution" TEXT NOT NULL DEFAULT 'blocked',
    "proposedResolution" JSONB,
    "owner" TEXT,
    "status" "InteropConflictStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteropConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteropReplay" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'single',
    "messageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reason" TEXT,
    "targetEnv" TEXT NOT NULL DEFAULT 'sandbox',
    "mappingVersion" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "status" "InteropReplayStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedBy" TEXT,
    "results" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteropReplay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteropBulkJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "interfaceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'kicked_off',
    "resourceTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "groupRef" TEXT,
    "scope" TEXT,
    "jobRef" TEXT,
    "files" JSONB NOT NULL DEFAULT '[]',
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "excludedRecords" INTEGER NOT NULL DEFAULT 0,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteropBulkJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteropSubscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "interfaceId" TEXT,
    "topic" TEXT NOT NULL,
    "criteria" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'rest-hook',
    "endpoint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastDeliveryAt" TIMESTAMP(3),
    "backlog" INTEGER NOT NULL DEFAULT 0,
    "failureState" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteropSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteropIncident" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "partners" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "affectedRecords" INTEGER NOT NULL DEFAULT 0,
    "clinicalRisk" TEXT NOT NULL DEFAULT 'unknown',
    "mitigation" TEXT,
    "owner" TEXT,
    "communications" JSONB NOT NULL DEFAULT '[]',
    "replayPlan" TEXT,
    "reconcilePlan" TEXT,
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "closureEvidence" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteropIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteropConformanceReport" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "interfaceId" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "InteropConformanceStatus" NOT NULL DEFAULT 'NOT_TESTED',
    "protocol" TEXT,
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "failures" JSONB NOT NULL DEFAULT '[]',
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidence" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "owner" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteropConformanceReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InteropInterface_workspaceId_interfaceId_key" ON "InteropInterface"("workspaceId", "interfaceId");
CREATE INDEX "InteropInterface_workspaceId_partner_idx" ON "InteropInterface"("workspaceId", "partner");
CREATE INDEX "InteropInterface_workspaceId_protocol_idx" ON "InteropInterface"("workspaceId", "protocol");
CREATE INDEX "InteropInterface_workspaceId_status_idx" ON "InteropInterface"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InteropMessage_idempotencyKey_key" ON "InteropMessage"("idempotencyKey");
CREATE INDEX "InteropMessage_workspaceId_interfaceId_idx" ON "InteropMessage"("workspaceId", "interfaceId");
CREATE INDEX "InteropMessage_workspaceId_protocol_idx" ON "InteropMessage"("workspaceId", "protocol");
CREATE INDEX "InteropMessage_workspaceId_status_idx" ON "InteropMessage"("workspaceId", "status");
CREATE INDEX "InteropMessage_workspaceId_patientId_idx" ON "InteropMessage"("workspaceId", "patientId");
CREATE INDEX "InteropMessage_rawHash_idx" ON "InteropMessage"("rawHash");
CREATE INDEX "InteropMessage_dedupKey_idx" ON "InteropMessage"("dedupKey");
CREATE INDEX "InteropMessage_receivedAt_idx" ON "InteropMessage"("receivedAt");

-- CreateIndex
CREATE INDEX "InteropValidation_workspaceId_messageId_idx" ON "InteropValidation"("workspaceId", "messageId");
CREATE INDEX "InteropValidation_workspaceId_outcome_idx" ON "InteropValidation"("workspaceId", "outcome");

-- CreateIndex
CREATE UNIQUE INDEX "InteropMapping_workspaceId_name_key" ON "InteropMapping"("workspaceId", "name");
CREATE INDEX "InteropMapping_workspaceId_sourceSystem_idx" ON "InteropMapping"("workspaceId", "sourceSystem");
CREATE INDEX "InteropMapping_workspaceId_active_idx" ON "InteropMapping"("workspaceId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "InteropTerminologyMap_workspaceId_sourceSystem_sourceCode_mappingVersion_key" ON "InteropTerminologyMap"("workspaceId", "sourceSystem", "sourceCode", "mappingVersion");
CREATE INDEX "InteropTerminologyMap_workspaceId_reviewStatus_idx" ON "InteropTerminologyMap"("workspaceId", "reviewStatus");
CREATE INDEX "InteropTerminologyMap_workspaceId_targetSystem_idx" ON "InteropTerminologyMap"("workspaceId", "targetSystem");
CREATE INDEX "InteropTerminologyMap_expiresAt_idx" ON "InteropTerminologyMap"("expiresAt");

-- CreateIndex
CREATE INDEX "InteropQuarantine_workspaceId_status_idx" ON "InteropQuarantine"("workspaceId", "status");
CREATE INDEX "InteropQuarantine_workspaceId_reason_idx" ON "InteropQuarantine"("workspaceId", "reason");
CREATE INDEX "InteropQuarantine_workspaceId_messageId_idx" ON "InteropQuarantine"("workspaceId", "messageId");

-- CreateIndex
CREATE INDEX "InteropConflict_workspaceId_status_idx" ON "InteropConflict"("workspaceId", "status");
CREATE INDEX "InteropConflict_workspaceId_type_idx" ON "InteropConflict"("workspaceId", "type");
CREATE INDEX "InteropConflict_workspaceId_patientId_idx" ON "InteropConflict"("workspaceId", "patientId");

-- CreateIndex
CREATE INDEX "InteropReplay_workspaceId_status_idx" ON "InteropReplay"("workspaceId", "status");
CREATE INDEX "InteropReplay_workspaceId_targetEnv_idx" ON "InteropReplay"("workspaceId", "targetEnv");

-- CreateIndex
CREATE INDEX "InteropBulkJob_workspaceId_status_idx" ON "InteropBulkJob"("workspaceId", "status");
CREATE INDEX "InteropBulkJob_workspaceId_interfaceId_idx" ON "InteropBulkJob"("workspaceId", "interfaceId");

-- CreateIndex
CREATE INDEX "InteropSubscription_workspaceId_status_idx" ON "InteropSubscription"("workspaceId", "status");
CREATE INDEX "InteropSubscription_workspaceId_topic_idx" ON "InteropSubscription"("workspaceId", "topic");

-- CreateIndex
CREATE INDEX "InteropIncident_workspaceId_status_idx" ON "InteropIncident"("workspaceId", "status");
CREATE INDEX "InteropIncident_workspaceId_kind_idx" ON "InteropIncident"("workspaceId", "kind");

-- CreateIndex
CREATE INDEX "InteropConformanceReport_workspaceId_interfaceId_idx" ON "InteropConformanceReport"("workspaceId", "interfaceId");
CREATE INDEX "InteropConformanceReport_workspaceId_status_idx" ON "InteropConformanceReport"("workspaceId", "status");
CREATE INDEX "InteropConformanceReport_expiresAt_idx" ON "InteropConformanceReport"("expiresAt");

-- AddForeignKey
ALTER TABLE "InteropInterface" ADD CONSTRAINT "InteropInterface_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteropMessage" ADD CONSTRAINT "InteropMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InteropMessage" ADD CONSTRAINT "InteropMessage_interfaceId_fkey" FOREIGN KEY ("interfaceId") REFERENCES "InteropInterface"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InteropMessage" ADD CONSTRAINT "InteropMessage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteropValidation" ADD CONSTRAINT "InteropValidation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InteropValidation" ADD CONSTRAINT "InteropValidation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "InteropMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteropMapping" ADD CONSTRAINT "InteropMapping_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteropTerminologyMap" ADD CONSTRAINT "InteropTerminologyMap_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteropQuarantine" ADD CONSTRAINT "InteropQuarantine_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InteropQuarantine" ADD CONSTRAINT "InteropQuarantine_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "InteropMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteropConflict" ADD CONSTRAINT "InteropConflict_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InteropConflict" ADD CONSTRAINT "InteropConflict_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteropReplay" ADD CONSTRAINT "InteropReplay_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteropBulkJob" ADD CONSTRAINT "InteropBulkJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteropSubscription" ADD CONSTRAINT "InteropSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteropIncident" ADD CONSTRAINT "InteropIncident_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteropConformanceReport" ADD CONSTRAINT "InteropConformanceReport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InteropConformanceReport" ADD CONSTRAINT "InteropConformanceReport_interfaceId_fkey" FOREIGN KEY ("interfaceId") REFERENCES "InteropInterface"("id") ON DELETE CASCADE ON UPDATE CASCADE;
