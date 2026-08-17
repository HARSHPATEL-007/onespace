CREATE TABLE IF NOT EXISTS "ChatPersonalizationProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "prioritySort" TEXT NOT NULL DEFAULT 'ACTIONABILITY_RECENCY',
  "digestEnabled" BOOLEAN NOT NULL DEFAULT false,
  "workingHoursStart" INTEGER NOT NULL DEFAULT 540,
  "workingHoursEnd" INTEGER NOT NULL DEFAULT 1020,
  "workdays" TEXT NOT NULL DEFAULT '["mon","tue","wed","thu","fri"]',
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "calendarAwareDnd" BOOLEAN NOT NULL DEFAULT false,
  "aiSuggestionsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatPersonalizationProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChatNotificationRule" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "urgency" INTEGER NOT NULL DEFAULT 0,
  "bypassDnd" BOOLEAN NOT NULL DEFAULT false,
  "snoozeUntil" TIMESTAMP(3),
  "source" TEXT NOT NULL DEFAULT 'USER',
  "reason" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatNotificationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChatDndWindow" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "days" TEXT NOT NULL DEFAULT '[]',
  "startMin" INTEGER NOT NULL,
  "endMin" INTEGER NOT NULL,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "calendarEventId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatDndWindow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChatPinnedItem" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "refId" TEXT NOT NULL,
  "shared" BOOLEAN NOT NULL DEFAULT false,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "pinUntil" TIMESTAMP(3),
  "note" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatPinnedItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChatPreferenceEvent" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "messageId" TEXT,
  "roomId" TEXT,
  "channelType" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatPreferenceEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatPersonalizationProfile_userId_key" ON "ChatPersonalizationProfile"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ChatPinnedItem_profileId_kind_refId_key" ON "ChatPinnedItem"("profileId", "kind", "refId");
CREATE INDEX IF NOT EXISTS "ChatNotificationRule_profileId_active_idx" ON "ChatNotificationRule"("profileId", "active");
CREATE INDEX IF NOT EXISTS "ChatNotificationRule_scope_value_idx" ON "ChatNotificationRule"("scope", "value");
CREATE INDEX IF NOT EXISTS "ChatDndWindow_profileId_active_idx" ON "ChatDndWindow"("profileId", "active");
CREATE INDEX IF NOT EXISTS "ChatPinnedItem_profileId_pinned_idx" ON "ChatPinnedItem"("profileId", "pinned");
CREATE INDEX IF NOT EXISTS "ChatPreferenceEvent_profileId_createdAt_idx" ON "ChatPreferenceEvent"("profileId", "createdAt");
CREATE INDEX IF NOT EXISTS "ChatPreferenceEvent_profileId_kind_idx" ON "ChatPreferenceEvent"("profileId", "kind");

ALTER TABLE "ChatPersonalizationProfile" ADD CONSTRAINT "ChatPersonalizationProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatNotificationRule" ADD CONSTRAINT "ChatNotificationRule_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ChatPersonalizationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatDndWindow" ADD CONSTRAINT "ChatDndWindow_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ChatPersonalizationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatPinnedItem" ADD CONSTRAINT "ChatPinnedItem_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ChatPersonalizationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatPreferenceEvent" ADD CONSTRAINT "ChatPreferenceEvent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ChatPersonalizationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;