-- N0VA BOOKLM+EDUCATION Quality Control: reports, review queues, rights, freshness

DO $$ BEGIN CREATE TYPE "QualityReviewQueue" AS ENUM ('SUBJECT_MATTER', 'PEDAGOGICAL', 'ACCESSIBILITY', 'CULTURAL', 'RIGHTS', 'SAFETY', 'EDITORIAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "QualityReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'WAIVED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "QualityReport" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT,
  "subjectType" TEXT NOT NULL DEFAULT 'artifact', "subjectId" TEXT NOT NULL,
  "dimensions" JSONB NOT NULL, "decision" TEXT NOT NULL DEFAULT 'draft',
  "ruleVersion" TEXT NOT NULL DEFAULT 'qc-1.0', "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "QualityReport_workspaceId_subjectType_subjectId_idx" ON "QualityReport"("workspaceId", "subjectType", "subjectId");
CREATE INDEX IF NOT EXISTS "QualityReport_workspaceId_setId_idx" ON "QualityReport"("workspaceId", "setId");

CREATE TABLE IF NOT EXISTS "QualityReview" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "reportId" TEXT NOT NULL,
  "queue" "QualityReviewQueue" NOT NULL, "status" "QualityReviewStatus" NOT NULL DEFAULT 'PENDING',
  "reviewerId" TEXT, "note" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityReview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "QualityReview_workspaceId_reportId_queue_idx" ON "QualityReview"("workspaceId", "reportId", "queue");

CREATE TABLE IF NOT EXISTS "RightsRecord" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "sourceKey" TEXT NOT NULL,
  "license" TEXT NOT NULL DEFAULT 'unknown', "expiresAt" TIMESTAMP(3),
  "derivativeAllowed" BOOLEAN NOT NULL DEFAULT false,
  "attributionRequired" BOOLEAN NOT NULL DEFAULT false,
  "scope" TEXT NOT NULL DEFAULT '', "evidence" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RightsRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RightsRecord_workspaceId_sourceKey_key" ON "RightsRecord"("workspaceId", "sourceKey");

CREATE TABLE IF NOT EXISTS "FreshnessRule" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT,
  "claimType" TEXT NOT NULL, "jurisdiction" TEXT NOT NULL DEFAULT '',
  "validDays" INTEGER NOT NULL DEFAULT 365, "refreshDays" INTEGER NOT NULL DEFAULT 90,
  "requiredReviewer" TEXT NOT NULL DEFAULT '', "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FreshnessRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FreshnessRule_workspaceId_setId_idx" ON "FreshnessRule"("workspaceId", "setId");
