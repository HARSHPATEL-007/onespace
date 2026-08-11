-- Chat Enhancements: threads, edits, attachments, pins, search, member roles

-- AlterTable: ChatChannel
ALTER TABLE "ChatChannel" ADD COLUMN "topic" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ChatChannel" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ChatChannel" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChatChannel" ADD COLUMN "pinnedAt" TIMESTAMP(3);
ALTER TABLE "ChatChannel" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "ChatChannel_workspaceId_kind_idx" ON "ChatChannel"("workspaceId", "kind");

-- AlterTable: ChatMessage
ALTER TABLE "ChatMessage" ADD COLUMN "authorAvatar" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "bodyHtml" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "parentId" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN "pinnedAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ChatMessage_parentId_idx" ON "ChatMessage"("parentId");
CREATE INDEX "ChatMessage_channelId_pinnedAt_idx" ON "ChatMessage"("channelId", "pinnedAt");

-- AlterTable: ChatMember
ALTER TYPE "ChatMemberRole" ADD VALUE IF NOT EXISTS 'OWNER';
ALTER TYPE "ChatMemberRole" ADD VALUE IF NOT EXISTS 'ADMIN';
ALTER TYPE "ChatMemberRole" ADD VALUE IF NOT EXISTS 'VIEWER';

-- Create enum if not exists (Prisma workaround)
DO $$ BEGIN
  CREATE TYPE "ChatMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "ChatMember" ADD COLUMN "role" "ChatMemberRole" NOT NULL DEFAULT 'MEMBER';
ALTER TABLE "ChatMember" ADD COLUMN "mutedUntil" TIMESTAMP(3);

-- CreateTable: ChatMessageEdit
CREATE TABLE "ChatMessageEdit" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "oldBody" TEXT NOT NULL,
    "newBody" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessageEdit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatMessageEdit_messageId_editedAt_idx" ON "ChatMessageEdit"("messageId", "editedAt" DESC);

ALTER TABLE "ChatMessageEdit" ADD CONSTRAINT "ChatMessageEdit_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ChatAttachment
CREATE TABLE "ChatAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "storageKey" TEXT NOT NULL,
    "thumbnailKey" TEXT,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatAttachment_messageId_idx" ON "ChatAttachment"("messageId");

ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ChatPin
CREATE TABLE "ChatPin" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "pinnedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatPin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatPin_messageId_key" ON "ChatPin"("messageId");
CREATE INDEX "ChatPin_channelId_idx" ON "ChatPin"("channelId");

ALTER TABLE "ChatPin" ADD CONSTRAINT "ChatPin_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatPin" ADD CONSTRAINT "ChatPin_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatPin" ADD CONSTRAINT "ChatPin_pinnedById_fkey"
  FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ChatSearchIndex
CREATE TABLE "ChatSearchIndex" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "searchVector" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatSearchIndex_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatSearchIndex_messageId_key" ON "ChatSearchIndex"("messageId");
CREATE INDEX "ChatSearchIndex_channelId_idx" ON "ChatSearchIndex"("channelId");
CREATE INDEX "ChatSearchIndex_workspaceId_idx" ON "ChatSearchIndex"("workspaceId");
