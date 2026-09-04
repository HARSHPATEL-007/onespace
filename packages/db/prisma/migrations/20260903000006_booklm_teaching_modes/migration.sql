-- N0VA BOOKLM+EDUCATION Teaching Modes: per-course mode policy

CREATE TABLE IF NOT EXISTS "TeachingModePolicy" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT NOT NULL,
  "mode" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false, "examConfig" JSONB, "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeachingModePolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TeachingModePolicy_workspaceId_setId_mode_key" ON "TeachingModePolicy"("workspaceId", "setId", "mode");
