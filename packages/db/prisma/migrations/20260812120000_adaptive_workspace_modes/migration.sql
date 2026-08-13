-- Adaptive workspace modes (spec: workspace-adaptive UI control plane)
-- Self-contained: creates WorkspaceMode / PaneType / AdaptivePaneState if the
-- origin dev DB (prisma db push) never recorded them in a migration, then
-- extends the enum with FLOW + MEDITATION and adds inference fields.
-- Explicit mode always wins; inference only ever suggests.

DO $$ BEGIN
  CREATE TYPE "WorkspaceMode" AS ENUM ('FOCUS', 'REVIEW', 'COLLABORATION', 'CRISIS', 'PRESENTATION', 'FLOW', 'MEDITATION');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PaneType" AS ENUM ('NONE', 'DOCS', 'TASKS', 'CALENDAR', 'CRM', 'THREAD', 'EMBED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Prisma creates a fresh enum for the new values in PostgreSQL; safest path
-- is ALTER TYPE ADD VALUE (requires PG 10+ and runs outside a transaction).
DO $$ BEGIN
  ALTER TYPE "WorkspaceMode" ADD VALUE IF NOT EXISTS 'FLOW';
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TYPE "WorkspaceMode" ADD VALUE IF NOT EXISTS 'MEDITATION';
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TABLE "AdaptivePaneState" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "workspaceId" TEXT NOT NULL,
      "currentMode" "WorkspaceMode" NOT NULL DEFAULT 'COLLABORATION',
      "activePane" "PaneType" NOT NULL DEFAULT 'NONE',
      "paneWidth" INTEGER NOT NULL DEFAULT 360,
      "collapsed" BOOLEAN NOT NULL DEFAULT false,
      "stateSource" TEXT NOT NULL DEFAULT 'manual',
      "stateConfidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
      "expiresAt" TIMESTAMP(3),
      "modeOverrides" JSONB NOT NULL DEFAULT '{}',
      "suggestedMode" "WorkspaceMode",
      "suggestedConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "suggestedAt" TIMESTAMP(3),
      "suggestedReasons" JSONB NOT NULL DEFAULT '[]',
      "inferredMode" "WorkspaceMode",
      "inferredConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "inferredAt" TIMESTAMP(3),
      "lastSwitchAt" TIMESTAMP(3),
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AdaptivePaneState_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "AdaptivePaneState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "AdaptivePaneState_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "AdaptivePaneState_userId_workspaceId_key"
  ON "AdaptivePaneState"("userId", "workspaceId");

ALTER TABLE "AdaptivePaneState"
  ADD COLUMN IF NOT EXISTS "stateSource" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "stateConfidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "modeOverrides" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "suggestedMode" "WorkspaceMode",
  ADD COLUMN IF NOT EXISTS "suggestedConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "suggestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "suggestedReasons" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "inferredMode" "WorkspaceMode",
  ADD COLUMN IF NOT EXISTS "inferredConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "inferredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastSwitchAt" TIMESTAMP(3);