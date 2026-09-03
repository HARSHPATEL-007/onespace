-- N0VA BOOKLM+EDUCATION Epistemics: evidence objects, claim graphs, source policies, challenges, answer audit

-- Enums (fresh types; transactional-safe)
DO $$ BEGIN CREATE TYPE "EpistemicState" AS ENUM ('SOURCE_FACT', 'SOURCE_SYNTHESIS', 'MODEL_INFERENCE', 'SPECULATION', 'LEARNER_CONTRIBUTION'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "VerificationLabel" AS ENUM ('DIRECTLY_SUPPORTED', 'QUALIFIED_SUPPORT', 'SYNTHESIZED', 'REASONED_INFERENCE', 'UNCERTAIN', 'CONFLICTING', 'NOT_FOUND', 'REQUIRES_REVIEW'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "EvidenceType" AS ENUM ('DEFINITION', 'OBSERVATION', 'STATISTIC', 'PROCEDURE', 'OPINION', 'CLAIM', 'EXAMPLE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ClaimRelation" AS ENUM ('SUPPORTS', 'PARTIALLY_SUPPORTS', 'CONTRADICTS', 'QUALIFIES', 'DEFINES', 'EXAMPLES', 'EXTENDS', 'DEPENDS_ON', 'SUPERSEDES', 'DERIVED_FROM', 'LEARNER_PROPOSED', 'REQUIRES_VERIFICATION'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AnswerMode" AS ENUM ('STRICT', 'GUIDED', 'EXPLORATORY', 'EXAM'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ChallengeCategory" AS ENUM ('NOT_SUPPORTED', 'CORRELATION_NOT_CAUSATION', 'LOST_QUALIFIER', 'WRONG_DOMAIN', 'EXTRACTION_ERROR', 'OUTDATED_SOURCE', 'OTHER'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Extend EvidenceCitation with canonical evidence-object fields (backward compatible)
ALTER TABLE "EvidenceCitation" ADD COLUMN IF NOT EXISTS "contentHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EvidenceCitation" ADD COLUMN IF NOT EXISTS "locatorHeading" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EvidenceCitation" ADD COLUMN IF NOT EXISTS "lineStart" INTEGER;
ALTER TABLE "EvidenceCitation" ADD COLUMN IF NOT EXISTS "lineEnd" INTEGER;
ALTER TABLE "EvidenceCitation" ADD COLUMN IF NOT EXISTS "evidenceType" "EvidenceType" NOT NULL DEFAULT 'CLAIM';
ALTER TABLE "EvidenceCitation" ADD COLUMN IF NOT EXISTS "sourceType" TEXT NOT NULL DEFAULT 'note';
ALTER TABLE "EvidenceCitation" ADD COLUMN IF NOT EXISTS "extractionConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5;
ALTER TABLE "EvidenceCitation" ADD COLUMN IF NOT EXISTS "freshnessScore" DOUBLE PRECISION;
ALTER TABLE "EvidenceCitation" ADD COLUMN IF NOT EXISTS "sourceDate" TIMESTAMP(3);
ALTER TABLE "EvidenceCitation" ADD COLUMN IF NOT EXISTS "epistemicState" "EpistemicState" NOT NULL DEFAULT 'SOURCE_FACT';
ALTER TABLE "EvidenceCitation" ADD COLUMN IF NOT EXISTS "verificationLabel" "VerificationLabel" NOT NULL DEFAULT 'DIRECTLY_SUPPORTED';
ALTER TABLE "EvidenceCitation" ADD COLUMN IF NOT EXISTS "accessScope" TEXT NOT NULL DEFAULT 'course-private';
ALTER TABLE "EvidenceCitation" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EvidenceCitation" ADD COLUMN IF NOT EXISTS "license" TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS "EvidenceCitation_workspaceId_sourceDocId_idx" ON "EvidenceCitation"("workspaceId", "sourceDocId");

-- ClaimNode: atomic claims per answer/set
CREATE TABLE IF NOT EXISTS "ClaimNode" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT, "answerId" TEXT,
  "text" TEXT NOT NULL, "normalizedKey" TEXT NOT NULL DEFAULT '', "position" INTEGER NOT NULL DEFAULT 0,
  "epistemicState" "EpistemicState" NOT NULL DEFAULT 'SOURCE_FACT',
  "verificationLabel" "VerificationLabel" NOT NULL DEFAULT 'UNCERTAIN',
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5, "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClaimNode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ClaimNode_workspaceId_answerId_idx" ON "ClaimNode"("workspaceId", "answerId");
CREATE INDEX IF NOT EXISTS "ClaimNode_workspaceId_setId_idx" ON "ClaimNode"("workspaceId", "setId");

-- ClaimEdge: polymorphic claim<->claim / claim<->evidence edges
CREATE TABLE IF NOT EXISTS "ClaimEdge" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT, "answerId" TEXT,
  "fromType" TEXT NOT NULL DEFAULT 'CLAIM', "fromId" TEXT NOT NULL,
  "toType" TEXT NOT NULL DEFAULT 'EVIDENCE', "toId" TEXT NOT NULL,
  "relation" "ClaimRelation" NOT NULL DEFAULT 'SUPPORTS',
  "strength" DOUBLE PRECISION NOT NULL DEFAULT 0.5, "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "direction" TEXT NOT NULL DEFAULT 'forward', "evidenceSpan" TEXT NOT NULL DEFAULT '',
  "modelVersion" TEXT NOT NULL DEFAULT '', "validatedStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
  "validatedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClaimEdge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ClaimEdge_workspaceId_answerId_idx" ON "ClaimEdge"("workspaceId", "answerId");
CREATE INDEX IF NOT EXISTS "ClaimEdge_workspaceId_fromId_idx" ON "ClaimEdge"("workspaceId", "fromId");
CREATE INDEX IF NOT EXISTS "ClaimEdge_workspaceId_toId_idx" ON "ClaimEdge"("workspaceId", "toId");

-- SourcePolicy: instructor governance per course (set)
CREATE TABLE IF NOT EXISTS "SourcePolicy" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT NOT NULL,
  "approvedSources" TEXT[] NOT NULL DEFAULT '{}', "restrictedSources" TEXT[] NOT NULL DEFAULT '{}',
  "requireTwoSources" BOOLEAN NOT NULL DEFAULT false, "requireCurrentVersion" BOOLEAN NOT NULL DEFAULT false,
  "requireHumanReview" BOOLEAN NOT NULL DEFAULT false, "examMode" BOOLEAN NOT NULL DEFAULT false,
  "examExternalSources" BOOLEAN NOT NULL DEFAULT false,
  "allowedInferenceLevel" TEXT NOT NULL DEFAULT 'marked',
  "minCoverage" DOUBLE PRECISION NOT NULL DEFAULT 0.5, "minIndependentSources" INTEGER NOT NULL DEFAULT 1,
  "retrievalWeights" JSONB, "freshnessLambda" JSONB,
  "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourcePolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SourcePolicy_workspaceId_setId_key" ON "SourcePolicy"("workspaceId", "setId");

-- EvidenceChallenge: learner/instructor citation disputes
CREATE TABLE IF NOT EXISTS "EvidenceChallenge" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "evidenceId" TEXT NOT NULL, "setId" TEXT,
  "category" "ChallengeCategory" NOT NULL DEFAULT 'OTHER',
  "reason" TEXT NOT NULL, "learnerNote" TEXT NOT NULL DEFAULT '',
  "status" "AppealStatus" NOT NULL DEFAULT 'OPEN', "userId" TEXT NOT NULL,
  "resolvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EvidenceChallenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EvidenceChallenge_workspaceId_evidenceId_idx" ON "EvidenceChallenge"("workspaceId", "evidenceId");
CREATE INDEX IF NOT EXISTS "EvidenceChallenge_workspaceId_status_idx" ON "EvidenceChallenge"("workspaceId", "status");

-- AnswerRecord: auditable grounded answers
CREATE TABLE IF NOT EXISTS "AnswerRecord" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT,
  "question" TEXT NOT NULL, "mode" "AnswerMode" NOT NULL DEFAULT 'GUIDED',
  "queryType" TEXT NOT NULL DEFAULT 'general', "answer" TEXT NOT NULL DEFAULT '',
  "scores" JSONB, "versionsUsed" JSONB,
  "modelVersion" TEXT NOT NULL DEFAULT '', "retrievalVersion" TEXT NOT NULL DEFAULT '',
  "refused" BOOLEAN NOT NULL DEFAULT false, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnswerRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AnswerRecord_workspaceId_setId_idx" ON "AnswerRecord"("workspaceId", "setId");
