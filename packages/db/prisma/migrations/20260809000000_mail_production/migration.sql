-- N0VA MAIL Production Migration
-- Adds: EmailAccount, MailLegalHold, MailRetentionPolicy, MailDiscoverySearch
-- Adds fields to MailMessage: legalHold, retentionReview, mailboxId, accountId, deliveryStatus, deliveredAt, deliveryError

-- CreateTable: EmailAccount
CREATE TABLE "EmailAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "smtpConfig" JSONB,
    "imapConfig" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id" ASC)
);

-- CreateTable: MailLegalHold
CREATE TABLE "MailLegalHold" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" TEXT NOT NULL,
    "releasedBy" TEXT,
    "scopeUsers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "scopeDateStart" TIMESTAMP(3) NOT NULL,
    "scopeDateEnd" TIMESTAMP(3) NOT NULL,
    "scopeKeywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "scopeAttachmentTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "notifiedCustodians" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    CONSTRAINT "MailLegalHold_pkey" PRIMARY KEY ("id" ASC)
);

-- CreateTable: MailRetentionPolicy
CREATE TABLE "MailRetentionPolicy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "retentionPeriodDays" INTEGER NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'archive',
    "applyTo" TEXT NOT NULL DEFAULT 'all',
    "target" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastAppliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MailRetentionPolicy_pkey" PRIMARY KEY ("id" ASC)
);

-- CreateTable: MailDiscoverySearch
CREATE TABLE "MailDiscoverySearch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL DEFAULT '',
    "filters" TEXT NOT NULL DEFAULT '{}',
    "resultsCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MailDiscoverySearch_pkey" PRIMARY KEY ("id" ASC)
);

-- AlterTable: MailMessage - add new fields
ALTER TABLE "MailMessage" ADD COLUMN "legalHold" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MailMessage" ADD COLUMN "retentionReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MailMessage" ADD COLUMN "mailboxId" TEXT;
ALTER TABLE "MailMessage" ADD COLUMN "accountId" TEXT;
ALTER TABLE "MailMessage" ADD COLUMN "deliveryStatus" TEXT DEFAULT 'pending';
ALTER TABLE "MailMessage" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "MailMessage" ADD COLUMN "deliveryError" TEXT;

-- CreateIndex: EmailAccount
CREATE INDEX "EmailAccount_workspaceId_isActive_idx" ON "EmailAccount"("workspaceId", "isActive");
CREATE INDEX "EmailAccount_workspaceId_isDefault_idx" ON "EmailAccount"("workspaceId", "isDefault");
CREATE INDEX "EmailAccount_workspaceId_idx" ON "EmailAccount"("workspaceId");

-- CreateIndex: MailLegalHold
CREATE INDEX "MailLegalHold_workspaceId_status_idx" ON "MailLegalHold"("workspaceId", "status");
CREATE INDEX "MailLegalHold_workspaceId_createdAt_idx" ON "MailLegalHold"("workspaceId", "createdAt" DESC);

-- CreateIndex: MailRetentionPolicy
CREATE INDEX "MailRetentionPolicy_workspaceId_enabled_idx" ON "MailRetentionPolicy"("workspaceId", "enabled");

-- CreateIndex: MailDiscoverySearch
CREATE INDEX "MailDiscoverySearch_workspaceId_createdAt_idx" ON "MailDiscoverySearch"("workspaceId", "createdAt" DESC);

-- CreateIndex: MailMessage new fields
CREATE INDEX "MailMessage_legalHold_idx" ON "MailMessage"("workspaceId", "legalHold");
CREATE INDEX "MailMessage_mailboxId_idx" ON "MailMessage"("workspaceId", "mailboxId");
CREATE INDEX "MailMessage_accountId_idx" ON "MailMessage"("workspaceId", "accountId");
CREATE INDEX "MailMessage_deliveryStatus_idx" ON "MailMessage"("workspaceId", "deliveryStatus");

-- AddForeignKey
ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailLegalHold" ADD CONSTRAINT "MailLegalHold_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailRetentionPolicy" ADD CONSTRAINT "MailRetentionPolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailDiscoverySearch" ADD CONSTRAINT "MailDiscoverySearch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailDiscoverySearch" ADD CONSTRAINT "MailDiscoverySearch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
