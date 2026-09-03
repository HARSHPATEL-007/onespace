-- Offline-First Edge Runtime — secure offline clinical runtime for rural clinics, ambulances,
-- emergency teams, outreach, disaster response, field workers. Approved capabilities only offline;
-- stale/local labels; queued sync; append-only events; cryptographic erasure; never unsupervised authority.

-- CreateEnum
CREATE TYPE "OfflineMode" AS ENUM ('ONLINE', 'DEGRADED', 'OFFLINE', 'EMERGENCY_OFFLINE', 'RECONNECTING', 'SYNCING', 'QUARANTINED_SYNC');

-- CreateEnum
CREATE TYPE "OfflineOutboxStatus" AS ENUM ('QUEUED', 'UPLOADED', 'ACCEPTED', 'REJECTED', 'CONFLICTED');

-- CreateEnum
CREATE TYPE "OfflineSyncStatus" AS ENUM ('STARTED', 'COMPLETED', 'COMPLETED_WITH_CONFLICTS', 'FAILED');

-- CreateEnum
CREATE TYPE "OfflineConflictStatus" AS ENUM ('OPEN', 'HUMAN_REVIEW', 'RESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "OfflineStoreForwardStatus" AS ENUM ('CAPTURED', 'QUEUED', 'UPLOADED', 'RECEIVED', 'ASSIGNED', 'VIEWED', 'RESPONDED', 'DELIVERED', 'ESCALATED', 'EXPIRED', 'FAILED', 'CLOSED');

-- CreateTable
CREATE TABLE "OfflineDevice" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "mode" "OfflineMode" NOT NULL DEFAULT 'ONLINE',
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "batteryPct" INTEGER,
    "storageFreeMb" INTEGER,
    "appVersion" TEXT,
    "bundleVersion" TEXT,
    "integrity" TEXT NOT NULL DEFAULT 'unverified',
    "encryption" JSONB NOT NULL DEFAULT '{}',
    "revokedAt" TIMESTAMP(3),
    "wipedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineCredential" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "scope" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deviceId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "offlineAllowed" BOOLEAN NOT NULL DEFAULT true,
    "revocationStatus" TEXT NOT NULL DEFAULT 'valid',
    "lastRevocationCheck" TIMESTAMP(3),
    "signature" TEXT,
    "emergencyOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineKnowledgeBundle" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "scope" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "jurisdiction" TEXT,
    "approvedBy" TEXT,
    "validFrom" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "hash" TEXT,
    "signature" TEXT,
    "offlineUse" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineKnowledgeBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineEmergencySummary" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "summaryRef" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataAsOf" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "provenance" TEXT NOT NULL DEFAULT 'server_signed',
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflineEmergencySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineEmergencyAccess" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "workerToken" TEXT NOT NULL,
    "role" TEXT,
    "reason" TEXT NOT NULL,
    "scope" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflineEmergencyAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineOutboxEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "patientId" TEXT,
    "resourceRef" TEXT,
    "operation" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "payloadHash" TEXT,
    "parentVersion" TEXT,
    "logicalClock" INTEGER NOT NULL DEFAULT 0,
    "signature" TEXT,
    "consentCtx" JSONB NOT NULL DEFAULT '{}',
    "priority" TEXT NOT NULL DEFAULT 'routine',
    "status" "OfflineOutboxStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineOutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineSyncSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "status" "OfflineSyncStatus" NOT NULL DEFAULT 'STARTED',
    "uploaded" INTEGER NOT NULL DEFAULT 0,
    "accepted" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "conflicts" INTEGER NOT NULL DEFAULT 0,
    "downloaded" INTEGER NOT NULL DEFAULT 0,
    "hashCheck" TEXT,
    "sequenceCheck" TEXT,
    "identityCheck" TEXT,
    "mediaCheck" TEXT,
    "lastServerVersion" TEXT,
    "nextAction" TEXT,
    "finishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineSyncSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineSyncConflict" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "deviceId" TEXT,
    "type" TEXT NOT NULL,
    "recordRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "patientId" TEXT,
    "defaultHandling" TEXT,
    "owner" TEXT,
    "status" "OfflineConflictStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" JSONB NOT NULL DEFAULT '{}',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineSyncConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineStoreForward" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "patientId" TEXT,
    "kind" TEXT NOT NULL,
    "payloadRef" TEXT,
    "payloadHash" TEXT,
    "consentRef" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'routine',
    "status" "OfflineStoreForwardStatus" NOT NULL DEFAULT 'CAPTURED',
    "receiverRole" TEXT,
    "respondedAt" TIMESTAMP(3),
    "receiptConfirmedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineStoreForward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineRetentionPolicy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "deviceProfile" TEXT NOT NULL,
    "retention" JSONB NOT NULL DEFAULT '{}',
    "deletion" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineRetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineSecurityIncident" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" TEXT,
    "actions" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineSecurityIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineDeviceReport" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "offlineMinutes" INTEGER NOT NULL DEFAULT 0,
    "batteryPct" INTEGER,
    "storageFreeMb" INTEGER,
    "queueSize" INTEGER NOT NULL DEFAULT 0,
    "criticalBacklog" INTEGER NOT NULL DEFAULT 0,
    "syncDurationMs" INTEGER,
    "syncSuccess" BOOLEAN,
    "conflictCount" INTEGER NOT NULL DEFAULT 0,
    "rejectionCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "integrityFails" INTEGER NOT NULL DEFAULT 0,
    "credentialDaysLeft" INTEGER,
    "bundleExpired" BOOLEAN NOT NULL DEFAULT false,
    "emergencyAccesses" INTEGER NOT NULL DEFAULT 0,
    "cdsUses" INTEGER NOT NULL DEFAULT 0,
    "mediaFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflineDeviceReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OfflineDevice_workspaceId_deviceId_key" ON "OfflineDevice"("workspaceId", "deviceId");
CREATE INDEX "OfflineDevice_workspaceId_status_idx" ON "OfflineDevice"("workspaceId", "status");
CREATE INDEX "OfflineDevice_workspaceId_mode_idx" ON "OfflineDevice"("workspaceId", "mode");

-- CreateIndex
CREATE INDEX "OfflineCredential_workspaceId_subject_idx" ON "OfflineCredential"("workspaceId", "subject");
CREATE INDEX "OfflineCredential_workspaceId_expiresAt_idx" ON "OfflineCredential"("workspaceId", "expiresAt");
CREATE INDEX "OfflineCredential_revocationStatus_idx" ON "OfflineCredential"("revocationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineKnowledgeBundle_workspaceId_bundleId_version_key" ON "OfflineKnowledgeBundle"("workspaceId", "bundleId", "version");
CREATE INDEX "OfflineKnowledgeBundle_workspaceId_status_idx" ON "OfflineKnowledgeBundle"("workspaceId", "status");
CREATE INDEX "OfflineKnowledgeBundle_expiresAt_idx" ON "OfflineKnowledgeBundle"("expiresAt");

-- CreateIndex
CREATE INDEX "OfflineEmergencySummary_workspaceId_patientId_idx" ON "OfflineEmergencySummary"("workspaceId", "patientId");
CREATE INDEX "OfflineEmergencySummary_expiresAt_idx" ON "OfflineEmergencySummary"("expiresAt");

-- CreateIndex
CREATE INDEX "OfflineEmergencyAccess_workspaceId_patientId_idx" ON "OfflineEmergencyAccess"("workspaceId", "patientId");
CREATE INDEX "OfflineEmergencyAccess_expiresAt_idx" ON "OfflineEmergencyAccess"("expiresAt");

-- CreateIndex
CREATE INDEX "OfflineOutboxEvent_workspaceId_deviceId_status_idx" ON "OfflineOutboxEvent"("workspaceId", "deviceId", "status");
CREATE INDEX "OfflineOutboxEvent_workspaceId_patientId_idx" ON "OfflineOutboxEvent"("workspaceId", "patientId");
CREATE INDEX "OfflineOutboxEvent_status_idx" ON "OfflineOutboxEvent"("status");
CREATE INDEX "OfflineOutboxEvent_priority_idx" ON "OfflineOutboxEvent"("priority");

-- CreateIndex
CREATE INDEX "OfflineSyncSession_workspaceId_deviceId_idx" ON "OfflineSyncSession"("workspaceId", "deviceId");
CREATE INDEX "OfflineSyncSession_workspaceId_status_idx" ON "OfflineSyncSession"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "OfflineSyncConflict_workspaceId_status_idx" ON "OfflineSyncConflict"("workspaceId", "status");
CREATE INDEX "OfflineSyncConflict_workspaceId_type_idx" ON "OfflineSyncConflict"("workspaceId", "type");

-- CreateIndex
CREATE INDEX "OfflineStoreForward_workspaceId_deviceId_status_idx" ON "OfflineStoreForward"("workspaceId", "deviceId", "status");
CREATE INDEX "OfflineStoreForward_workspaceId_patientId_idx" ON "OfflineStoreForward"("workspaceId", "patientId");
CREATE INDEX "OfflineStoreForward_status_idx" ON "OfflineStoreForward"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineRetentionPolicy_workspaceId_deviceProfile_key" ON "OfflineRetentionPolicy"("workspaceId", "deviceProfile");
CREATE INDEX "OfflineRetentionPolicy_workspaceId_active_idx" ON "OfflineRetentionPolicy"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "OfflineSecurityIncident_workspaceId_status_idx" ON "OfflineSecurityIncident"("workspaceId", "status");
CREATE INDEX "OfflineSecurityIncident_workspaceId_deviceId_idx" ON "OfflineSecurityIncident"("workspaceId", "deviceId");

-- CreateIndex
CREATE INDEX "OfflineDeviceReport_workspaceId_deviceId_idx" ON "OfflineDeviceReport"("workspaceId", "deviceId");
CREATE INDEX "OfflineDeviceReport_createdAt_idx" ON "OfflineDeviceReport"("createdAt");

-- AddForeignKey
ALTER TABLE "OfflineDevice" ADD CONSTRAINT "OfflineDevice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineCredential" ADD CONSTRAINT "OfflineCredential_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineKnowledgeBundle" ADD CONSTRAINT "OfflineKnowledgeBundle_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineEmergencySummary" ADD CONSTRAINT "OfflineEmergencySummary_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfflineEmergencySummary" ADD CONSTRAINT "OfflineEmergencySummary_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineEmergencyAccess" ADD CONSTRAINT "OfflineEmergencyAccess_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfflineEmergencyAccess" ADD CONSTRAINT "OfflineEmergencyAccess_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineOutboxEvent" ADD CONSTRAINT "OfflineOutboxEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfflineOutboxEvent" ADD CONSTRAINT "OfflineOutboxEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineSyncSession" ADD CONSTRAINT "OfflineSyncSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineSyncConflict" ADD CONSTRAINT "OfflineSyncConflict_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfflineSyncConflict" ADD CONSTRAINT "OfflineSyncConflict_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineStoreForward" ADD CONSTRAINT "OfflineStoreForward_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfflineStoreForward" ADD CONSTRAINT "OfflineStoreForward_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineRetentionPolicy" ADD CONSTRAINT "OfflineRetentionPolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineSecurityIncident" ADD CONSTRAINT "OfflineSecurityIncident_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineDeviceReport" ADD CONSTRAINT "OfflineDeviceReport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
