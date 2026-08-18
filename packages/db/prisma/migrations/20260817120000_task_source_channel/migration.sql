-- AlterTable
ALTER TABLE "Task" ADD COLUMN "sourceChannelId" TEXT;

-- CreateIndex
CREATE INDEX "Task_workspaceId_sourceChannelId_idx" ON "Task"("workspaceId", "sourceChannelId");
