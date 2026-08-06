-- CreateTable
CREATE TABLE "SheetWorkbook" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SheetWorkbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sheet" (
    "id" TEXT NOT NULL,
    "workbookId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rows" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SheetWorkbook_workspaceId_updatedAt_idx" ON "SheetWorkbook"("workspaceId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Sheet_workbookId_idx" ON "Sheet"("workbookId");

-- AddForeignKey
ALTER TABLE "SheetWorkbook" ADD CONSTRAINT "SheetWorkbook_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetWorkbook" ADD CONSTRAINT "SheetWorkbook_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sheet" ADD CONSTRAINT "Sheet_workbookId_fkey" FOREIGN KEY ("workbookId") REFERENCES "SheetWorkbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
