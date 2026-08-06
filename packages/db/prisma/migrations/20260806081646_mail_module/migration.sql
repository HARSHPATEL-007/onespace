-- CreateEnum
CREATE TYPE "MailDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "MailFolder" AS ENUM ('INBOX', 'SENT', 'ARCHIVE', 'TRASH');

-- CreateTable
CREATE TABLE "MailMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "direction" "MailDirection" NOT NULL DEFAULT 'IN',
    "folder" "MailFolder" NOT NULL DEFAULT 'INBOX',
    "fromName" TEXT NOT NULL DEFAULT '',
    "fromEmail" TEXT NOT NULL,
    "toEmails" JSONB NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '(no subject)',
    "body" TEXT NOT NULL DEFAULT '',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isStarred" BOOLEAN NOT NULL DEFAULT false,
    "inReplyToId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailLabel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#7c5cfc',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailLabelMap" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "MailLabelMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailMessage_workspaceId_folder_sentAt_idx" ON "MailMessage"("workspaceId", "folder", "sentAt" DESC);

-- CreateIndex
CREATE INDEX "MailMessage_workspaceId_threadId_idx" ON "MailMessage"("workspaceId", "threadId");

-- CreateIndex
CREATE UNIQUE INDEX "MailLabelMap_messageId_labelId_key" ON "MailLabelMap"("messageId", "labelId");

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailLabel" ADD CONSTRAINT "MailLabel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailLabelMap" ADD CONSTRAINT "MailLabelMap_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailLabelMap" ADD CONSTRAINT "MailLabelMap_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "MailLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
