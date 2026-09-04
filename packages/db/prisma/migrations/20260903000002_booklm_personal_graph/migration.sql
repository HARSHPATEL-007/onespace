-- N0VA BOOKLM+EDUCATION Personal Graph: learner model, memory, adaptive planning

-- Enums (fresh types; transactional-safe)
DO $$ BEGIN CREATE TYPE "MasteryStatus" AS ENUM ('UNKNOWN', 'EXPOSED', 'RECOGNIZED', 'EMERGING', 'PRACTICED', 'RELIABLE', 'TRANSFER_CAPABLE', 'DURABLE', 'INDEPENDENT', 'MENTOR_CAPABLE', 'DECAYING', 'CONTESTED', 'MISAPPLIED', 'SUPERSEDED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ConceptDependencyRel" AS ENUM ('PREREQUISITE_OF', 'PART_OF', 'GENERALIZES', 'SPECIALIZES', 'ANALOGOUS_TO', 'CONTRASTS_WITH', 'COMMONLY_CONFUSED_WITH', 'ENABLES', 'APPLIED_IN', 'ASSESSED_BY', 'EXPLAINED_BY', 'SUPERSEDED_BY', 'REQUIRES_SKILL', 'REQUIRES_CONTEXT'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "DependencyKind" AS ENUM ('HARD', 'SOFT', 'HIDDEN', 'LOCAL', 'TRANSFER', 'REMEDIAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "MisconceptionStatus" AS ENUM ('CANDIDATE', 'EVIDENCE_GATHERING', 'TESTING', 'CLARIFICATION', 'CONFIRMED', 'DISMISSED', 'REMEDIATION', 'REASSESSED', 'RESOLVED', 'DORMANT', 'PERSISTENT'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "RecommendationStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'DISMISSED', 'EXPIRED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Extend LearnerMastery with dimensions, state machine, transfer, verification
ALTER TABLE "LearnerMastery" ADD COLUMN IF NOT EXISTS "dimensions" JSONB;
ALTER TABLE "LearnerMastery" ADD COLUMN IF NOT EXISTS "dimensionRanges" JSONB;
ALTER TABLE "LearnerMastery" ADD COLUMN IF NOT EXISTS "status" "MasteryStatus" NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "LearnerMastery" ADD COLUMN IF NOT EXISTS "stateEvidence" TEXT NOT NULL DEFAULT '';
ALTER TABLE "LearnerMastery" ADD COLUMN IF NOT EXISTS "lastVerifiedAt" TIMESTAMP(3);
ALTER TABLE "LearnerMastery" ADD COLUMN IF NOT EXISTS "transferContexts" JSONB;
CREATE INDEX IF NOT EXISTS "LearnerMastery_workspaceId_userId_status_idx" ON "LearnerMastery"("workspaceId", "userId", "status");

-- LearnerProfile
CREATE TABLE IF NOT EXISTS "LearnerProfile" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL, "kind" TEXT NOT NULL DEFAULT 'academic',
  "goals" JSONB, "priorities" JSONB, "vocabulary" TEXT NOT NULL DEFAULT '',
  "modalities" TEXT[] NOT NULL DEFAULT '{}', "timeCapMin" INTEGER,
  "standards" TEXT NOT NULL DEFAULT '', "sharing" JSONB, "privacy" JSONB,
  "isDefault" BOOLEAN NOT NULL DEFAULT false, "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearnerProfile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LearnerProfile_workspaceId_userId_idx" ON "LearnerProfile"("workspaceId", "userId");

-- LearnerGoal
CREATE TABLE IF NOT EXISTS "LearnerGoal" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL, "profileId" TEXT,
  "title" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '',
  "competencyKeys" TEXT[] NOT NULL DEFAULT '{}', "deadline" TIMESTAMP(3),
  "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE', "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearnerGoal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LearnerGoal_workspaceId_userId_status_idx" ON "LearnerGoal"("workspaceId", "userId", "status");

-- MasteryObservation (event-sourced learner-state updates)
CREATE TABLE IF NOT EXISTS "MasteryObservation" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "conceptId" TEXT NOT NULL,
  "userId" TEXT NOT NULL, "profileId" TEXT, "dimension" TEXT NOT NULL DEFAULT 'recall',
  "value" DOUBLE PRECISION NOT NULL, "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "sourceType" TEXT NOT NULL DEFAULT 'assessment', "sourceId" TEXT NOT NULL DEFAULT '',
  "context" TEXT NOT NULL DEFAULT '', "novelty" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "modelVersion" TEXT NOT NULL DEFAULT '', "visibility" TEXT NOT NULL DEFAULT 'learner-and-instructor',
  "correctionOf" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MasteryObservation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MasteryObservation_workspaceId_conceptId_userId_createdAt_idx" ON "MasteryObservation"("workspaceId", "conceptId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "MasteryObservation_workspaceId_userId_createdAt_idx" ON "MasteryObservation"("workspaceId", "userId", "createdAt");

-- Misconception
CREATE TABLE IF NOT EXISTS "Misconception" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "conceptId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "statement" TEXT NOT NULL, "detectedFrom" TEXT[] NOT NULL DEFAULT '{}',
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5, "severity" TEXT NOT NULL DEFAULT 'medium',
  "affectedConceptIds" TEXT[] NOT NULL DEFAULT '{}', "counterevidence" TEXT[] NOT NULL DEFAULT '{}',
  "status" "MisconceptionStatus" NOT NULL DEFAULT 'CANDIDATE',
  "learnerAcknowledged" BOOLEAN NOT NULL DEFAULT false, "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Misconception_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Misconception_workspaceId_userId_status_idx" ON "Misconception"("workspaceId", "userId", "status");
CREATE INDEX IF NOT EXISTS "Misconception_workspaceId_conceptId_idx" ON "Misconception"("workspaceId", "conceptId");

-- ConceptDependency
CREATE TABLE IF NOT EXISTS "ConceptDependency" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT,
  "fromId" TEXT NOT NULL, "toId" TEXT NOT NULL,
  "relation" "ConceptDependencyRel" NOT NULL DEFAULT 'PREREQUISITE_OF',
  "kind" "DependencyKind" NOT NULL DEFAULT 'SOFT',
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "mandatory" BOOLEAN NOT NULL DEFAULT false, "scope" TEXT NOT NULL DEFAULT '',
  "approved" BOOLEAN NOT NULL DEFAULT false, "approvedById" TEXT, "alternatives" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConceptDependency_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ConceptDependency_workspaceId_toId_idx" ON "ConceptDependency"("workspaceId", "toId");
CREATE INDEX IF NOT EXISTS "ConceptDependency_workspaceId_fromId_idx" ON "ConceptDependency"("workspaceId", "fromId");

-- Recommendation
CREATE TABLE IF NOT EXISTS "Recommendation" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "setId" TEXT, "profileId" TEXT, "action" TEXT NOT NULL,
  "reasonCodes" TEXT[] NOT NULL DEFAULT '{}', "explanation" TEXT[] NOT NULL DEFAULT '{}',
  "evidence" TEXT[] NOT NULL DEFAULT '{}', "alternatives" TEXT[] NOT NULL DEFAULT '{}',
  "expectedBenefit" TEXT NOT NULL DEFAULT '', "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "status" "RecommendationStatus" NOT NULL DEFAULT 'PROPOSED', "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Recommendation_workspaceId_userId_status_idx" ON "Recommendation"("workspaceId", "userId", "status");

-- GraphCorrection
CREATE TABLE IF NOT EXISTS "GraphCorrection" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL, "targetId" TEXT NOT NULL, "field" TEXT NOT NULL,
  "oldValue" TEXT NOT NULL DEFAULT '', "newValue" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '', "scope" TEXT NOT NULL DEFAULT 'profile',
  "undone" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GraphCorrection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GraphCorrection_workspaceId_userId_targetId_idx" ON "GraphCorrection"("workspaceId", "userId", "targetId");
