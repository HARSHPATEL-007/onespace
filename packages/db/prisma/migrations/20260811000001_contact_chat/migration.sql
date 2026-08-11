-- Contact-Chat unified feature: n0vachat fields + contact_chat_link table

-- AlterTable: Contact
ALTER TABLE "Contact" ADD COLUMN "phoneE164" TEXT;
ALTER TABLE "Contact" ADD COLUMN "n0vachatId" TEXT;
ALTER TABLE "Contact" ADD COLUMN "username" TEXT;
ALTER TABLE "Contact" ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'N0VA';
ALTER TABLE "Contact" ADD COLUMN "address" TEXT;
ALTER TABLE "Contact" ADD COLUMN "website" TEXT;

CREATE INDEX "Contact_workspaceId_phone_idx" ON "Contact"("workspaceId", "phone");
CREATE INDEX "Contact_workspaceId_n0vachatId_idx" ON "Contact"("workspaceId", "n0vachatId");
CREATE UNIQUE INDEX "Contact_workspaceId_n0vachatId_key" ON "Contact"("workspaceId", "n0vachatId");

-- CreateTable: ContactChatLink
CREATE TABLE "ContactChatLink" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT,
    "userId" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'N0VA',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactChatLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactChatLink_contactId_idx" ON "ContactChatLink"("contactId");
CREATE INDEX "ContactChatLink_workspaceId_userId_idx" ON "ContactChatLink"("workspaceId", "userId");
CREATE INDEX "ContactChatLink_channelId_idx" ON "ContactChatLink"("channelId");

ALTER TABLE "ContactChatLink" ADD CONSTRAINT "ContactChatLink_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactChatLink" ADD CONSTRAINT "ContactChatLink_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactChatLink" ADD CONSTRAINT "ContactChatLink_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContactChatLink" ADD CONSTRAINT "ContactChatLink_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
