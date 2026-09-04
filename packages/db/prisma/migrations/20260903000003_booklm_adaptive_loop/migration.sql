-- N0VA BOOKLM+EDUCATION Adaptive Loop: closed-loop pedagogical control

DO $$ BEGIN CREATE TYPE "OverrideKind" AS ENUM ('SET_LEVEL', 'LOCK_DIFFICULTY', 'ASSIGN_REPAIR_PATH', 'EXEMPT_CONCEPT', 'FORCE_MODALITY', 'CUSTOM_MISCONCEPTION_RULE', 'MARK_VERIFIED', 'PAUSE_PERSONALIZATION', 'RESTORE_STATE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "OverrideScope" AS ENUM ('CONCEPT', 'COURSE', 'PROFILE', 'GLOBAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "LearnerProfile" ADD COLUMN IF NOT EXISTS "preferences" JSONB;

CREATE TABLE IF NOT EXISTS "AdaptiveLoop" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT, "conceptId" TEXT, "userId" TEXT NOT NULL,
  "stateBefore" JSONB, "evidence" TEXT[] NOT NULL DEFAULT '{}',
  "strategy" TEXT NOT NULL DEFAULT '', "alternatives" TEXT[] NOT NULL DEFAULT '{}',
  "contentRef" TEXT NOT NULL DEFAULT '', "difficulty" JSONB, "response" JSONB,
  "learningGain" DOUBLE PRECISION, "gainConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "overriddenById" TEXT, "overrideReason" TEXT NOT NULL DEFAULT '',
  "modelVersion" TEXT NOT NULL DEFAULT '', "policyVersion" TEXT NOT NULL DEFAULT '', "curriculumVersion" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdaptiveLoop_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AdaptiveLoop_workspaceId_userId_conceptId_idx" ON "AdaptiveLoop"("workspaceId", "userId", "conceptId");
CREATE INDEX IF NOT EXISTS "AdaptiveLoop_workspaceId_setId_idx" ON "AdaptiveLoop"("workspaceId", "setId");

CREATE TABLE IF NOT EXISTS "DifficultyState" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "conceptId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "level" INTEGER NOT NULL DEFAULT 1, "dims" JSONB, "targetBand" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
  "eta" DOUBLE PRECISION NOT NULL DEFAULT 0.4, "mu" DOUBLE PRECISION NOT NULL DEFAULT 0.3, "nu" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
  "locked" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DifficultyState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DifficultyState_workspaceId_conceptId_userId_key" ON "DifficultyState"("workspaceId", "conceptId", "userId");
CREATE INDEX IF NOT EXISTS "DifficultyState_workspaceId_userId_idx" ON "DifficultyState"("workspaceId", "userId");

CREATE TABLE IF NOT EXISTS "RetrievalItem" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT, "conceptId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "itemKey" TEXT NOT NULL, "stabilityDays" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "retrievability" DOUBLE PRECISION NOT NULL DEFAULT 0.5, "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "lastAttempt" TIMESTAMP(3), "nextDue" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "contextCount" INTEGER NOT NULL DEFAULT 0, "transferCount" INTEGER NOT NULL DEFAULT 0,
  "scheduleType" TEXT NOT NULL DEFAULT 'expanding', "format" TEXT NOT NULL DEFAULT 'recall',
  "successes" INTEGER NOT NULL DEFAULT 0, "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RetrievalItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RetrievalItem_workspaceId_conceptId_userId_itemKey_key" ON "RetrievalItem"("workspaceId", "conceptId", "userId", "itemKey");
CREATE INDEX IF NOT EXISTS "RetrievalItem_workspaceId_userId_nextDue_idx" ON "RetrievalItem"("workspaceId", "userId", "nextDue");

CREATE TABLE IF NOT EXISTS "AdaptivePolicy" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT NOT NULL,
  "difficultyMin" INTEGER NOT NULL DEFAULT 0, "difficultyMax" INTEGER NOT NULL DEFAULT 9,
  "prereqThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.4, "hintLimit" INTEGER NOT NULL DEFAULT 3,
  "masteryDefinition" JSONB, "transferRequired" BOOLEAN NOT NULL DEFAULT true,
  "minIntervalHours" INTEGER NOT NULL DEFAULT 12, "interleaving" JSONB, "accommodations" JSONB,
  "escalationThreshold" INTEGER NOT NULL DEFAULT 3, "externalAllowed" BOOLEAN NOT NULL DEFAULT true,
  "weights" JSONB, "highStakesReview" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1, "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdaptivePolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AdaptivePolicy_workspaceId_setId_key" ON "AdaptivePolicy"("workspaceId", "setId");

CREATE TABLE IF NOT EXISTS "InstructorOverride" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT,
  "targetType" TEXT NOT NULL, "targetId" TEXT NOT NULL,
  "kind" "OverrideKind" NOT NULL, "payload" JSONB,
  "reason" TEXT NOT NULL, "authorId" TEXT NOT NULL,
  "scope" "OverrideScope" NOT NULL DEFAULT 'CONCEPT',
  "expiresAt" TIMESTAMP(3), "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InstructorOverride_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InstructorOverride_workspaceId_targetId_active_idx" ON "InstructorOverride"("workspaceId", "targetId", "active");

CREATE TABLE IF NOT EXISTS "SessionPlan" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT, "userId" TEXT NOT NULL,
  "plan" JSONB NOT NULL, "rationale" TEXT[] NOT NULL DEFAULT '{}',
  "accepted" BOOLEAN NOT NULL DEFAULT false, "modification" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SessionPlan_workspaceId_userId_idx" ON "SessionPlan"("workspaceId", "userId");

CREATE TABLE IF NOT EXISTS "ModalityEffect" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "conceptId" TEXT, "userId" TEXT NOT NULL,
  "modality" TEXT NOT NULL, "gainSum" DOUBLE PRECISION NOT NULL DEFAULT 0, "trials" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModalityEffect_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ModalityEffect_workspaceId_conceptId_userId_modality_key" ON "ModalityEffect"("workspaceId", "conceptId", "userId", "modality");
CREATE INDEX IF NOT EXISTS "ModalityEffect_workspaceId_userId_idx" ON "ModalityEffect"("workspaceId", "userId");
