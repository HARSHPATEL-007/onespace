-- Notification Engine: Policy-Driven Attention System

DO $$ BEGIN CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED','SCORING','FILTERED','SUPPRESSED','DELIVERING','DELIVERED','ACKNOWLEDGED','FAILED','DIGESTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "DeliveryChannel" AS ENUM ('WEBSOCKET','FCM','APNS','SMS','EMAIL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING','SENT','DELIVERED','FAILED','BOUNCED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "RulePriority" AS ENUM ('LOW','NORMAL','HIGH','CRITICAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "DigestFrequency" AS ENUM ('REALTIME','HOURLY','DAILY','WEEKLY'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "DigestStatus" AS ENUM ('PENDING','GENERATING','READY','DELIVERED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE "NotificationEvent" (
    "id" TEXT NOT NULL, "recipientId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "sourceType" TEXT NOT NULL, "sourceId" TEXT,
    "roomId" TEXT, "threadId" TEXT, "title" TEXT NOT NULL, "body" TEXT, "link" TEXT,
    "signals" JSONB NOT NULL DEFAULT '{}', "priorityScore" INTEGER NOT NULL DEFAULT 0, "channelPlan" TEXT[] NOT NULL DEFAULT '{}',
    "ruleHits" TEXT[] NOT NULL DEFAULT '{}', "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "digestId" TEXT, "escalationLevel" INTEGER NOT NULL DEFAULT 0, "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id"));
CREATE INDEX "NotificationEvent_recipientId_status_idx" ON "NotificationEvent"("recipientId", "status");
CREATE INDEX "NotificationEvent_recipientId_priorityScore_idx" ON "NotificationEvent"("recipientId", "priorityScore" DESC);
CREATE INDEX "NotificationEvent_digestId_idx" ON "NotificationEvent"("digestId");
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DeliveryRecord" (
    "id" TEXT NOT NULL, "notificationId" TEXT NOT NULL, "channel" "DeliveryChannel" NOT NULL, "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0, "lastAttemptAt" TIMESTAMP(3), "deliveredAt" TIMESTAMP(3), "failedAt" TIMESTAMP(3),
    "failureReason" TEXT, "idempotencyKey" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryRecord_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DeliveryRecord_idempotencyKey_key" ON "DeliveryRecord"("idempotencyKey");
CREATE INDEX "DeliveryRecord_notificationId_channel_idx" ON "DeliveryRecord"("notificationId", "channel");
ALTER TABLE "DeliveryRecord" ADD CONSTRAINT "DeliveryRecord_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "NotificationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NotificationRule" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" "RulePriority" NOT NULL DEFAULT 'NORMAL', "conditions" JSONB NOT NULL DEFAULT '[]', "actions" JSONB NOT NULL DEFAULT '[]',
    "stopProcessing" BOOLEAN NOT NULL DEFAULT false, "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id"));
CREATE INDEX "NotificationRule_userId_workspaceId_order_idx" ON "NotificationRule"("userId", "workspaceId", "order");
ALTER TABLE "NotificationRule" ADD CONSTRAINT "NotificationRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationRule" ADD CONSTRAINT "NotificationRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UserNotificationPrefs" (
    "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "channelPrefs" JSONB NOT NULL DEFAULT '{}',
    "quietHoursStart" TEXT, "quietHoursEnd" TEXT, "focusModeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "digestFrequency" "DigestFrequency" NOT NULL DEFAULT 'HOURLY', "escalationLevel" INTEGER NOT NULL DEFAULT 2,
    "perRoomOverrides" JSONB NOT NULL DEFAULT '{}', "perSenderOverrides" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserNotificationPrefs_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "UserNotificationPrefs_userId_workspaceId_key" ON "UserNotificationPrefs"("userId", "workspaceId");
ALTER TABLE "UserNotificationPrefs" ADD CONSTRAINT "UserNotificationPrefs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserNotificationPrefs" ADD CONSTRAINT "UserNotificationPrefs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NotificationDigest" (
    "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL, "roomId" TEXT, "title" TEXT NOT NULL, "summary" TEXT NOT NULL,
    "highlights" JSONB NOT NULL DEFAULT '[]', "decisionChanges" JSONB NOT NULL DEFAULT '[]', "actionItems" JSONB NOT NULL DEFAULT '[]',
    "mentions" JSONB NOT NULL DEFAULT '[]', "messageCount" INTEGER NOT NULL DEFAULT 0, "status" "DigestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "deliveredAt" TIMESTAMP(3),
    CONSTRAINT "NotificationDigest_pkey" PRIMARY KEY ("id"));
CREATE INDEX "NotificationDigest_userId_status_idx" ON "NotificationDigest"("userId", "status");
ALTER TABLE "NotificationDigest" ADD CONSTRAINT "NotificationDigest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDigest" ADD CONSTRAINT "NotificationDigest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EscalationRecord" (
    "id" TEXT NOT NULL, "notificationId" TEXT NOT NULL, "userId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL,
    "currentLevel" INTEGER NOT NULL DEFAULT 0, "maxLevel" INTEGER NOT NULL DEFAULT 3, "nextEscalationAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EscalationRecord_pkey" PRIMARY KEY ("id"));
CREATE INDEX "EscalationRecord_userId_currentLevel_idx" ON "EscalationRecord"("userId", "currentLevel");
ALTER TABLE "EscalationRecord" ADD CONSTRAINT "EscalationRecord_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "NotificationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EscalationRecord" ADD CONSTRAINT "EscalationRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EscalationRecord" ADD CONSTRAINT "EscalationRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
