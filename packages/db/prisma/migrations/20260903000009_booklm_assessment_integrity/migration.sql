-- N0VA BOOKLM+EDUCATION Assessment Integrity: items, exposure, records, appeals, accommodations, defenses

DO $$ BEGIN CREATE TYPE "IntegrityStatus" AS ENUM ('CLEAR', 'INFORMATIONAL', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL', 'REVIEW_REQUIRED', 'CLEARED', 'VIOLATION'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "IntegrityAppealStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'UPHELD', 'OVERTURNED', 'WITHDRAWN'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ItemStatus" AS ENUM ('ACTIVE', 'FROZEN', 'RETIRED', 'INVALIDATED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "policy" JSONB;
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "stakes" TEXT NOT NULL DEFAULT 'low';

CREATE TABLE IF NOT EXISTS "AssessmentItem" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "assessmentId" TEXT, "setId" TEXT,
  "templateKey" TEXT NOT NULL, "variantOf" TEXT, "variantId" TEXT NOT NULL DEFAULT '',
  "prompt" TEXT NOT NULL DEFAULT '', "invariants" TEXT[] NOT NULL DEFAULT '{}',
  "randomizedFields" TEXT[] NOT NULL DEFAULT '{}',
  "difficultyEstimate" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "biasCheck" TEXT NOT NULL DEFAULT 'pending', "accessibilityCheck" TEXT NOT NULL DEFAULT 'pending',
  "status" "ItemStatus" NOT NULL DEFAULT 'ACTIVE', "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AssessmentItem_workspaceId_assessmentId_idx" ON "AssessmentItem"("workspaceId", "assessmentId");
CREATE INDEX IF NOT EXISTS "AssessmentItem_workspaceId_templateKey_idx" ON "AssessmentItem"("workspaceId", "templateKey");

CREATE TABLE IF NOT EXISTS "ItemExposure" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "itemId" TEXT,
  "templateKey" TEXT NOT NULL DEFAULT '', "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'view', "authorized" BOOLEAN NOT NULL DEFAULT true,
  "setId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ItemExposure_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ItemExposure_workspaceId_itemId_userId_idx" ON "ItemExposure"("workspaceId", "itemId", "userId");
CREATE INDEX IF NOT EXISTS "ItemExposure_workspaceId_templateKey_idx" ON "ItemExposure"("workspaceId", "templateKey");

CREATE TABLE IF NOT EXISTS "IntegrityRecord" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "assessmentId" TEXT, "setId" TEXT,
  "userId" TEXT NOT NULL, "submissionRef" TEXT NOT NULL DEFAULT '',
  "status" "IntegrityStatus" NOT NULL DEFAULT 'CLEAR',
  "academicScore" DOUBLE PRECISION, "grader" TEXT NOT NULL DEFAULT '', "gradeConfidence" DOUBLE PRECISION,
  "signals" JSONB, "excludedSignals" TEXT[] NOT NULL DEFAULT '{}',
  "accommodation" JSONB, "technicalEvents" JSONB,
  "reviewerId" TEXT, "reviewDecision" TEXT NOT NULL DEFAULT '', "reviewReason" TEXT NOT NULL DEFAULT '',
  "appealDeadline" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrityRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IntegrityRecord_workspaceId_userId_status_idx" ON "IntegrityRecord"("workspaceId", "userId", "status");
CREATE INDEX IF NOT EXISTS "IntegrityRecord_workspaceId_assessmentId_idx" ON "IntegrityRecord"("workspaceId", "assessmentId");

CREATE TABLE IF NOT EXISTS "IntegrityAppeal" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "recordId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "reason" TEXT NOT NULL, "evidence" TEXT NOT NULL DEFAULT '',
  "status" "IntegrityAppealStatus" NOT NULL DEFAULT 'OPEN',
  "resolution" TEXT NOT NULL DEFAULT '', "resolvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrityAppeal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IntegrityAppeal_workspaceId_recordId_idx" ON "IntegrityAppeal"("workspaceId", "recordId");

CREATE TABLE IF NOT EXISTS "Accommodation" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL, "setId" TEXT,
  "effects" TEXT[] NOT NULL DEFAULT '{}', "active" BOOLEAN NOT NULL DEFAULT true,
  "verifiedBy" TEXT NOT NULL DEFAULT '', "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Accommodation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Accommodation_workspaceId_userId_active_idx" ON "Accommodation"("workspaceId", "userId", "active");

CREATE TABLE IF NOT EXISTS "OralDefense" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "assessmentId" TEXT, "setId" TEXT,
  "userId" TEXT NOT NULL, "topic" TEXT NOT NULL DEFAULT '', "scores" JSONB,
  "consentRecording" BOOLEAN NOT NULL DEFAULT false, "transcript" TEXT NOT NULL DEFAULT '',
  "reviewerId" TEXT, "status" TEXT NOT NULL DEFAULT 'scheduled',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OralDefense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OralDefense_workspaceId_userId_idx" ON "OralDefense"("workspaceId", "userId");
