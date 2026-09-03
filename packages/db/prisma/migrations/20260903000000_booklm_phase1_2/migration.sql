-- N0VA BOOKLM+EDUCATION Phase 1+2: evidence engine, knowledge graph, adaptive, tutor, assessment, collaboration

-- Enums
DO $$ BEGIN CREATE TYPE "EvidenceSupport" AS ENUM ('SUPPORTS', 'CONTRADICTS', 'QUALIFIES'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "LearnerConceptKind" AS ENUM ('CONCEPT', 'SKILL', 'MISCONCEPTION', 'PREREQ', 'GOAL', 'INTEREST'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ConceptRelation" AS ENUM ('PREREQUISITE', 'RELATED', 'CONTRADICTS', 'PART_OF', 'UNLOCKS'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "TutorMode" AS ENUM ('SOCRATIC', 'DIRECT', 'WORKED_EXAMPLE', 'PRACTICE', 'EXAM', 'DEBUGGING', 'DEBATE', 'RESEARCH_SUPERVISOR', 'FLASHCARD', 'ORAL_EXAM', 'PEER_REVIEW', 'ACCESSIBILITY'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "TutorMemoryScope" AS ENUM ('SESSION', 'COURSE', 'LONG_TERM', 'TEMP', 'CLASSROOM_SHARED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "QuizAttemptMode" AS ENUM ('PRACTICE', 'EXAM', 'OPEN_BOOK', 'CLOSED_BOOK', 'ORAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AppealStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'UPHELD', 'OVERTURNED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Extend existing tables
ALTER TABLE "LearningSet" ADD COLUMN IF NOT EXISTS "difficulty" TEXT NOT NULL DEFAULT 'NOVICE';
ALTER TABLE "LearningSet" ADD COLUMN IF NOT EXISTS "goal" TEXT NOT NULL DEFAULT '';
ALTER TABLE "LearningItem" ADD COLUMN IF NOT EXISTS "extractionConfidence" DOUBLE PRECISION;
ALTER TABLE "LearningItem" ADD COLUMN IF NOT EXISTS "sourceVersion" TEXT NOT NULL DEFAULT '';
ALTER TABLE "LearningItem" ADD COLUMN IF NOT EXISTS "authorityScore" INTEGER NOT NULL DEFAULT 50;

-- EvidenceCitation
CREATE TABLE IF NOT EXISTS "EvidenceCitation" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT, "itemId" TEXT,
  "claim" TEXT NOT NULL, "quote" TEXT NOT NULL DEFAULT '',
  "sourceKind" "LearningKind" NOT NULL DEFAULT 'NOTE',
  "sourceTitle" TEXT NOT NULL DEFAULT '', "sourceDocId" TEXT,
  "locatorPage" INTEGER, "locatorParagraph" INTEGER, "locatorTimestamp" TEXT NOT NULL DEFAULT '',
  "sourceVersion" TEXT NOT NULL DEFAULT '', "authority" INTEGER NOT NULL DEFAULT 50,
  "freshnessAt" TIMESTAMP(3), "support" "EvidenceSupport" NOT NULL DEFAULT 'SUPPORTS',
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5, "provenance" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EvidenceCitation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EvidenceCitation_workspaceId_setId_idx" ON "EvidenceCitation"("workspaceId", "setId");
CREATE INDEX IF NOT EXISTS "EvidenceCitation_workspaceId_itemId_idx" ON "EvidenceCitation"("workspaceId", "itemId");

-- LearnerConcept
CREATE TABLE IF NOT EXISTS "LearnerConcept" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT,
  "key" TEXT NOT NULL, "label" TEXT NOT NULL,
  "kind" "LearnerConceptKind" NOT NULL DEFAULT 'CONCEPT',
  "description" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearnerConcept_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LearnerConcept_workspaceId_setId_key_key" ON "LearnerConcept"("workspaceId", "setId", "key");
CREATE INDEX IF NOT EXISTS "LearnerConcept_workspaceId_setId_idx" ON "LearnerConcept"("workspaceId", "setId");

-- ConceptEdge
CREATE TABLE IF NOT EXISTS "ConceptEdge" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "fromId" TEXT NOT NULL, "toId" TEXT NOT NULL,
  "relation" "ConceptRelation" NOT NULL DEFAULT 'RELATED', "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  CONSTRAINT "ConceptEdge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ConceptEdge_workspaceId_idx" ON "ConceptEdge"("workspaceId");

-- LearnerMastery
CREATE TABLE IF NOT EXISTS "LearnerMastery" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "conceptId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "mastery" DOUBLE PRECISION NOT NULL DEFAULT 0, "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "evidenceCount" INTEGER NOT NULL DEFAULT 0, "misconceptionFlag" BOOLEAN NOT NULL DEFAULT false,
  "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5, "intervalDays" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "decayRate" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextReviewAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LearnerMastery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LearnerMastery_workspaceId_conceptId_userId_key" ON "LearnerMastery"("workspaceId", "conceptId", "userId");
CREATE INDEX IF NOT EXISTS "LearnerMastery_workspaceId_userId_nextReviewAt_idx" ON "LearnerMastery"("workspaceId", "userId", "nextReviewAt");

-- StudyPlan
CREATE TABLE IF NOT EXISTS "StudyPlan" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "goal" TEXT NOT NULL DEFAULT '', "nextAction" TEXT NOT NULL DEFAULT '', "nextActionReason" TEXT NOT NULL DEFAULT '',
  "difficulty" TEXT NOT NULL DEFAULT 'NOVICE', "modality" TEXT NOT NULL DEFAULT 'text',
  "streakDays" INTEGER NOT NULL DEFAULT 0, "workloadCapMin" INTEGER NOT NULL DEFAULT 30,
  "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudyPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StudyPlan_workspaceId_setId_userId_key" ON "StudyPlan"("workspaceId", "setId", "userId");

-- QuizAttempt
CREATE TABLE IF NOT EXISTS "QuizAttempt" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "mode" "QuizAttemptMode" NOT NULL DEFAULT 'PRACTICE',
  "score" INTEGER NOT NULL DEFAULT 0, "total" INTEGER NOT NULL DEFAULT 0, "durationSec" INTEGER NOT NULL DEFAULT 0,
  "integrityFlags" TEXT NOT NULL DEFAULT '', "accommodation" TEXT NOT NULL DEFAULT '',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "submittedAt" TIMESTAMP(3),
  CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "QuizAttempt_workspaceId_setId_userId_idx" ON "QuizAttempt"("workspaceId", "setId", "userId");

-- QuizResponse
CREATE TABLE IF NOT EXISTS "QuizResponse" (
  "id" TEXT NOT NULL, "attemptId" TEXT NOT NULL, "prompt" TEXT NOT NULL, "answer" TEXT NOT NULL,
  "picked" TEXT NOT NULL DEFAULT '', "correct" BOOLEAN NOT NULL DEFAULT false,
  "responseTimeMs" INTEGER NOT NULL DEFAULT 0, "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "conceptKey" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "QuizResponse_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "QuizResponse_attemptId_idx" ON "QuizResponse"("attemptId");

-- TutorSession
CREATE TABLE IF NOT EXISTS "TutorSession" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT, "userId" TEXT NOT NULL,
  "mode" "TutorMode" NOT NULL DEFAULT 'DIRECT', "agent" TEXT NOT NULL DEFAULT 'tutor',
  "status" TEXT NOT NULL DEFAULT 'open', "summary" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TutorSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TutorSession_workspaceId_userId_idx" ON "TutorSession"("workspaceId", "userId");

-- TutorMemory
CREATE TABLE IF NOT EXISTS "TutorMemory" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL, "sessionId" TEXT,
  "scope" "TutorMemoryScope" NOT NULL DEFAULT 'SESSION',
  "key" TEXT NOT NULL, "value" TEXT NOT NULL, "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "provenance" TEXT NOT NULL DEFAULT '', "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TutorMemory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TutorMemory_workspaceId_userId_scope_idx" ON "TutorMemory"("workspaceId", "userId", "scope");

-- PedagogicalDecision
CREATE TABLE IF NOT EXISTS "PedagogicalDecision" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "sessionId" TEXT NOT NULL,
  "detectedIssue" TEXT NOT NULL, "evidenceUsed" TEXT NOT NULL DEFAULT '',
  "chosenStrategy" TEXT NOT NULL, "alternatives" TEXT NOT NULL DEFAULT '',
  "expectedOutcome" TEXT NOT NULL DEFAULT '', "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "learnerOverride" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PedagogicalDecision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PedagogicalDecision_sessionId_idx" ON "PedagogicalDecision"("sessionId");

-- Assessment
CREATE TABLE IF NOT EXISTS "Assessment" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT,
  "title" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Assessment_workspaceId_setId_idx" ON "Assessment"("workspaceId", "setId");

-- RubricCriterion
CREATE TABLE IF NOT EXISTS "RubricCriterion" (
  "id" TEXT NOT NULL, "assessmentId" TEXT NOT NULL, "label" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '', "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "maxPoints" DOUBLE PRECISION NOT NULL DEFAULT 10,
  CONSTRAINT "RubricCriterion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RubricCriterion_assessmentId_idx" ON "RubricCriterion"("assessmentId");

-- Grade
CREATE TABLE IF NOT EXISTS "Grade" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "assessmentId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "totalPoints" DOUBLE PRECISION NOT NULL DEFAULT 0, "maxPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "explanation" TEXT NOT NULL DEFAULT '', "blindKey" TEXT NOT NULL DEFAULT '',
  "approved" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Grade_workspaceId_assessmentId_idx" ON "Grade"("workspaceId", "assessmentId");
CREATE INDEX IF NOT EXISTS "Grade_assessmentId_userId_idx" ON "Grade"("assessmentId", "userId");

-- GradeEvidence
CREATE TABLE IF NOT EXISTS "GradeEvidence" (
  "id" TEXT NOT NULL, "gradeId" TEXT NOT NULL, "criterionId" TEXT NOT NULL,
  "points" DOUBLE PRECISION NOT NULL DEFAULT 0, "evidenceQuote" TEXT NOT NULL DEFAULT '',
  "reasoning" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "GradeEvidence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GradeEvidence_gradeId_idx" ON "GradeEvidence"("gradeId");

-- GradeAudit
CREATE TABLE IF NOT EXISTS "GradeAudit" (
  "id" TEXT NOT NULL, "gradeId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL, "action" TEXT NOT NULL, "detail" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GradeAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GradeAudit_gradeId_idx" ON "GradeAudit"("gradeId");

-- GradeAppeal
CREATE TABLE IF NOT EXISTS "GradeAppeal" (
  "id" TEXT NOT NULL, "gradeId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "reason" TEXT NOT NULL, "status" "AppealStatus" NOT NULL DEFAULT 'OPEN', "resolution" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GradeAppeal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GradeAppeal_gradeId_idx" ON "GradeAppeal"("gradeId");

-- LearningAnnotation
CREATE TABLE IF NOT EXISTS "LearningAnnotation" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT, "itemId" TEXT,
  "userId" TEXT NOT NULL, "quote" TEXT NOT NULL DEFAULT '', "comment" TEXT NOT NULL,
  "threadId" TEXT, "resolved" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearningAnnotation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LearningAnnotation_workspaceId_setId_idx" ON "LearningAnnotation"("workspaceId", "setId");
CREATE INDEX IF NOT EXISTS "LearningAnnotation_workspaceId_itemId_idx" ON "LearningAnnotation"("workspaceId", "itemId");

-- FK constraints (best-effort; skipped if tables missing in partial envs)
DO $$ BEGIN ALTER TABLE "EvidenceCitation" ADD CONSTRAINT "EvidenceCitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "EvidenceCitation" ADD CONSTRAINT "EvidenceCitation_setId_fkey" FOREIGN KEY ("setId") REFERENCES "LearningSet"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "EvidenceCitation" ADD CONSTRAINT "EvidenceCitation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LearningItem"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "LearnerConcept" ADD CONSTRAINT "LearnerConcept_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "LearnerConcept" ADD CONSTRAINT "LearnerConcept_setId_fkey" FOREIGN KEY ("setId") REFERENCES "LearningSet"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ConceptEdge" ADD CONSTRAINT "ConceptEdge_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ConceptEdge" ADD CONSTRAINT "ConceptEdge_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "LearnerConcept"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "ConceptEdge" ADD CONSTRAINT "ConceptEdge_toId_fkey" FOREIGN KEY ("toId") REFERENCES "LearnerConcept"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "LearnerMastery" ADD CONSTRAINT "LearnerMastery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "LearnerMastery" ADD CONSTRAINT "LearnerMastery_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "LearnerConcept"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "LearnerMastery" ADD CONSTRAINT "LearnerMastery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "StudyPlan" ADD CONSTRAINT "StudyPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "StudyPlan" ADD CONSTRAINT "StudyPlan_setId_fkey" FOREIGN KEY ("setId") REFERENCES "LearningSet"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "StudyPlan" ADD CONSTRAINT "StudyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_setId_fkey" FOREIGN KEY ("setId") REFERENCES "LearningSet"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "QuizResponse" ADD CONSTRAINT "QuizResponse_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QuizAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TutorSession" ADD CONSTRAINT "TutorSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TutorSession" ADD CONSTRAINT "TutorSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TutorMemory" ADD CONSTRAINT "TutorMemory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "TutorMemory" ADD CONSTRAINT "TutorMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "PedagogicalDecision" ADD CONSTRAINT "PedagogicalDecision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "PedagogicalDecision" ADD CONSTRAINT "PedagogicalDecision_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TutorSession"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "RubricCriterion" ADD CONSTRAINT "RubricCriterion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Grade" ADD CONSTRAINT "Grade_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Grade" ADD CONSTRAINT "Grade_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "Grade" ADD CONSTRAINT "Grade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "GradeEvidence" ADD CONSTRAINT "GradeEvidence_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "GradeEvidence" ADD CONSTRAINT "GradeEvidence_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "RubricCriterion"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "GradeAudit" ADD CONSTRAINT "GradeAudit_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "GradeAudit" ADD CONSTRAINT "GradeAudit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "GradeAppeal" ADD CONSTRAINT "GradeAppeal_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "GradeAppeal" ADD CONSTRAINT "GradeAppeal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "GradeAppeal" ADD CONSTRAINT "GradeAppeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "LearningAnnotation" ADD CONSTRAINT "LearningAnnotation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "LearningAnnotation" ADD CONSTRAINT "LearningAnnotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
