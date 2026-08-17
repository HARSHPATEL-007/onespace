CREATE TABLE IF NOT EXISTS "ChatPoll" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "options" JSONB NOT NULL DEFAULT '[]',
  "createdById" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "expiresAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "messageId" TEXT,
  CONSTRAINT "ChatPoll_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatPoll_messageId_key" ON "ChatPoll"("messageId");
CREATE INDEX IF NOT EXISTS "ChatPoll_workspaceId_channelId_createdAt_idx" ON "ChatPoll"("workspaceId", "channelId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "ChatPollVote" (
  "id" TEXT NOT NULL,
  "pollId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "optionIndex" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatPollVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatPollVote_pollId_userId_key" ON "ChatPollVote"("pollId", "userId");
CREATE INDEX IF NOT EXISTS "ChatPollVote_pollId_idx" ON "ChatPollVote"("pollId");

CREATE TABLE IF NOT EXISTS "Reminder" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "remindAt" TIMESTAMP(3) NOT NULL,
  "channelId" TEXT,
  "sourceMessageId" TEXT,
  "targetUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "firedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Reminder_userId_status_remindAt_idx" ON "Reminder"("userId", "status", "remindAt");
CREATE INDEX IF NOT EXISTS "Reminder_workspaceId_status_idx" ON "Reminder"("workspaceId", "status");

ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "pollId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ChatMessage_pollId_key" ON "ChatMessage"("pollId");

ALTER TABLE "ChatPoll" ADD CONSTRAINT "ChatPoll_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatPoll" ADD CONSTRAINT "ChatPoll_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatPoll" ADD CONSTRAINT "ChatPoll_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatPoll" ADD CONSTRAINT "ChatPoll_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChatPollVote" ADD CONSTRAINT "ChatPollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "ChatPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatPollVote" ADD CONSTRAINT "ChatPollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "ChatPoll"("id") ON DELETE SET NULL ON UPDATE CASCADE;