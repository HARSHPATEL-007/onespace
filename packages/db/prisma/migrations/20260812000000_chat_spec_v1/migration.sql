-- Chat spec v1: saved searches, bookmarks, ephemeral TTL, presence extras, announcement channels

-- Create enum if not exists (Prisma workaround)
DO $$ BEGIN
  CREATE TYPE "PresenceStatus" AS ENUM ('ONLINE', 'IDLE', 'AWAY', 'BUSY', 'DND', 'READ_ONLY', 'OFFLINE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TYPE "PresenceStatus" ADD VALUE IF NOT EXISTS 'DND';
ALTER TYPE "ChatChannelKind" ADD VALUE IF NOT EXISTS 'ANNOUNCEMENT';

ALTER TABLE "ChatMessage" ADD COLUMN "ttlSeconds" INTEGER;
ALTER TABLE "ChatMessage" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN "viewedBy" JSONB NOT NULL DEFAULT '[]';

-- PresenceSession was previously only created via `prisma db push`; create it
-- here so the migration chain is self-contained.
DO $$ BEGIN
  CREATE TABLE "PresenceSession" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "workspaceId" TEXT NOT NULL,
      "status" "PresenceStatus" NOT NULL DEFAULT 'ONLINE',
      "activeResource" TEXT,
      "activeResourceType" TEXT,
      "activeSection" TEXT,
      "typingInChannel" TEXT,
      "cursorX" INTEGER,
      "cursorY" INTEGER,
      "cursorResourceId" TEXT,
      "selectionStart" INTEGER,
      "selectionEnd" INTEGER,
      "selectionResourceId" TEXT,
      "viewportX" INTEGER,
      "viewportY" INTEGER,
      "viewportWidth" INTEGER,
      "viewportHeight" INTEGER,
      "lastHeartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "color" TEXT NOT NULL DEFAULT '#7c5cfc',
      "customStatus" TEXT NOT NULL DEFAULT '',
      CONSTRAINT "PresenceSession_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "PresenceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "PresenceSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "PresenceSession_workspaceId_status_idx" ON "PresenceSession"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "PresenceSession_workspaceId_activeResource_idx" ON "PresenceSession"("workspaceId", "activeResource");
CREATE INDEX IF NOT EXISTS "PresenceSession_userId_workspaceId_idx" ON "PresenceSession"("userId", "workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "PresenceSession_userId_workspaceId_key" ON "PresenceSession"("userId", "workspaceId");

ALTER TABLE "PresenceSession" ADD COLUMN IF NOT EXISTS "customStatus" TEXT DEFAULT '';

CREATE TABLE "ChatSavedSearch" (
    "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL, "name" TEXT NOT NULL,
    "query" TEXT NOT NULL, "filters" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatSavedSearch_pkey" PRIMARY KEY ("id"));
CREATE INDEX "ChatSavedSearch_workspaceId_userId_idx" ON "ChatSavedSearch"("workspaceId", "userId");
CREATE INDEX "ChatSavedSearch_userId_updatedAt_idx" ON "ChatSavedSearch"("userId", "updatedAt" DESC);
ALTER TABLE "ChatSavedSearch" ADD CONSTRAINT "ChatSavedSearch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatSavedSearch" ADD CONSTRAINT "ChatSavedSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChatBookmark" (
    "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL, "messageId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatBookmark_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "ChatBookmark_userId_messageId_key" ON "ChatBookmark"("userId", "messageId");
CREATE INDEX "ChatBookmark_workspaceId_userId_idx" ON "ChatBookmark"("workspaceId", "userId");
CREATE INDEX "ChatBookmark_channelId_idx" ON "ChatBookmark"("channelId");
ALTER TABLE "ChatBookmark" ADD CONSTRAINT "ChatBookmark_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatBookmark" ADD CONSTRAINT "ChatBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatBookmark" ADD CONSTRAINT "ChatBookmark_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatBookmark" ADD CONSTRAINT "ChatBookmark_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
