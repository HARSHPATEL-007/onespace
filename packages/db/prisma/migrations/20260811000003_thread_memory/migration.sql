-- Thread Memory & Decision System

DO $$ BEGIN CREATE TYPE "ThreadVisibility" AS ENUM ('ROOM', 'WORKSPACE', 'PRIVATE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ThreadStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'ARCHIVED', 'MERGED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "DecisionStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'SUPERSEDED', 'REVOKED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ActionPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ExtractionMethod" AS ENUM ('AI_AUTO', 'MANUAL', 'BULK'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PinType" AS ENUM ('ROOM', 'PERSONAL', 'PRIORITY'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PinPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ExportFormat" AS ENUM ('MARKDOWN', 'PDF', 'DOCX', 'JSON'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ExportMode" AS ENUM ('FULL', 'BRANCH', 'RANGE', 'SUMMARY_ONLY', 'SUMMARY_TRANSCRIPT'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE "ThreadMetadata" (
    "id" TEXT NOT NULL, "threadId" TEXT NOT NULL, "rootMessageId" TEXT NOT NULL, "channelId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Thread', "parentThreadId" TEXT, "depth" INTEGER NOT NULL DEFAULT 0, "branchPath" JSONB NOT NULL DEFAULT '[]',
    "summaryShort" TEXT, "summaryBullets" JSONB NOT NULL DEFAULT '[]', "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replyCount" INTEGER NOT NULL DEFAULT 0, "participantCount" INTEGER NOT NULL DEFAULT 0, "labels" TEXT[] NOT NULL DEFAULT '{}',
    "visibility" "ThreadVisibility" NOT NULL DEFAULT 'ROOM', "status" "ThreadStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ThreadMetadata_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "ThreadMetadata_threadId_key" ON "ThreadMetadata"("threadId");
CREATE INDEX "ThreadMetadata_channelId_idx" ON "ThreadMetadata"("channelId");
CREATE INDEX "ThreadMetadata_workspaceId_status_idx" ON "ThreadMetadata"("workspaceId", "status");
CREATE INDEX "ThreadMetadata_parentThreadId_idx" ON "ThreadMetadata"("parentThreadId");
ALTER TABLE "ThreadMetadata" ADD CONSTRAINT "ThreadMetadata_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThreadMetadata" ADD CONSTRAINT "ThreadMetadata_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThreadMetadata" ADD CONSTRAINT "ThreadMetadata_parentThreadId_fkey" FOREIGN KEY ("parentThreadId") REFERENCES "ThreadMetadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ThreadDecision" (
    "id" TEXT NOT NULL, "threadId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "sourceMessageId" TEXT, "sourceQuote" TEXT,
    "decisionText" TEXT NOT NULL, "authorName" TEXT, "status" "DecisionStatus" NOT NULL DEFAULT 'PROPOSED', "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3), "linkedTaskId" TEXT, "linkedDocId" TEXT, "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ThreadDecision_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ThreadDecision_threadId_idx" ON "ThreadDecision"("threadId");
CREATE INDEX "ThreadDecision_workspaceId_status_idx" ON "ThreadDecision"("workspaceId", "status");
ALTER TABLE "ThreadDecision" ADD CONSTRAINT "ThreadDecision_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ThreadMetadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThreadDecision" ADD CONSTRAINT "ThreadDecision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ThreadActionItem" (
    "id" TEXT NOT NULL, "threadId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "sourceMessageId" TEXT, "sourceQuote" TEXT,
    "title" TEXT NOT NULL, "ownerName" TEXT, "ownerUserId" TEXT, "dueDate" TIMESTAMP(3), "priority" "ActionPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ActionStatus" NOT NULL DEFAULT 'OPEN', "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0, "extractedBy" "ExtractionMethod" NOT NULL DEFAULT 'AI_AUTO',
    "confirmedBy" TEXT, "confirmedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ThreadActionItem_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ThreadActionItem_threadId_idx" ON "ThreadActionItem"("threadId");
CREATE INDEX "ThreadActionItem_workspaceId_status_idx" ON "ThreadActionItem"("workspaceId", "status");
CREATE INDEX "ThreadActionItem_ownerUserId_idx" ON "ThreadActionItem"("ownerUserId");
CREATE INDEX "ThreadActionItem_dueDate_idx" ON "ThreadActionItem"("dueDate");
ALTER TABLE "ThreadActionItem" ADD CONSTRAINT "ThreadActionItem_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ThreadMetadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThreadActionItem" ADD CONSTRAINT "ThreadActionItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ThreadPin" (
    "id" TEXT NOT NULL, "threadId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL, "pinType" "PinType" NOT NULL DEFAULT 'ROOM',
    "priority" "PinPriority" NOT NULL DEFAULT 'NORMAL', "reason" TEXT, "expiresAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ThreadPin_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ThreadPin_workspaceId_pinType_idx" ON "ThreadPin"("workspaceId", "pinType");
ALTER TABLE "ThreadPin" ADD CONSTRAINT "ThreadPin_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ThreadMetadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThreadPin" ADD CONSTRAINT "ThreadPin_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThreadPin" ADD CONSTRAINT "ThreadPin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ThreadBookmark" (
    "id" TEXT NOT NULL, "threadId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL, "messageId" TEXT, "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ThreadBookmark_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ThreadBookmark_userId_idx" ON "ThreadBookmark"("userId");
ALTER TABLE "ThreadBookmark" ADD CONSTRAINT "ThreadBookmark_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ThreadMetadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThreadBookmark" ADD CONSTRAINT "ThreadBookmark_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThreadBookmark" ADD CONSTRAINT "ThreadBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ThreadExport" (
    "id" TEXT NOT NULL, "threadId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "createdById" TEXT NOT NULL, "format" "ExportFormat" NOT NULL,
    "exportMode" "ExportMode" NOT NULL, "content" TEXT NOT NULL, "fileSize" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ThreadExport_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ThreadExport_threadId_idx" ON "ThreadExport"("threadId");
ALTER TABLE "ThreadExport" ADD CONSTRAINT "ThreadExport_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ThreadMetadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThreadExport" ADD CONSTRAINT "ThreadExport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThreadExport" ADD CONSTRAINT "ThreadExport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
