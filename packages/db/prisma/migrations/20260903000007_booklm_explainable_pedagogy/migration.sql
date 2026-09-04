-- N0VA BOOKLM+EDUCATION Explainable Pedagogy: decision records + reviews

DO $$ BEGIN CREATE TYPE "PedagogyDecisionStatus" AS ENUM ('PROPOSED', 'PENDING_LEARNER', 'ACCEPTED', 'MODIFIED', 'REJECTED', 'DEFERRED', 'ESCALATED', 'DELIVERED', 'MEASURED', 'REVIEWED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "DecisionRecord" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT, "userId" TEXT NOT NULL,
  "conceptId" TEXT, "trigger" TEXT NOT NULL DEFAULT '',
  "issueType" TEXT NOT NULL DEFAULT 'insufficient_evidence',
  "issueDescription" TEXT NOT NULL DEFAULT '', "severity" TEXT NOT NULL DEFAULT 'moderate',
  "evidence" JSONB, "chosenMode" TEXT NOT NULL DEFAULT '', "chosenAction" TEXT NOT NULL DEFAULT '',
  "alternatives" JSONB, "expectedTarget" TEXT NOT NULL DEFAULT '', "successMeasure" TEXT NOT NULL DEFAULT '',
  "confOverall" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "confIssue" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "confStrategy" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "confOutcome" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "status" "PedagogyDecisionStatus" NOT NULL DEFAULT 'PROPOSED',
  "controlBy" TEXT, "controlNote" TEXT NOT NULL DEFAULT '',
  "provenance" JSONB, "version" INTEGER NOT NULL DEFAULT 1, "supersedesId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DecisionRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DecisionRecord_workspaceId_userId_status_idx" ON "DecisionRecord"("workspaceId", "userId", "status");
CREATE INDEX IF NOT EXISTS "DecisionRecord_workspaceId_setId_status_idx" ON "DecisionRecord"("workspaceId", "setId", "status");

CREATE TABLE IF NOT EXISTS "DecisionReview" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "decisionId" TEXT NOT NULL,
  "predictedOutcome" TEXT NOT NULL DEFAULT '', "observedOutcome" TEXT NOT NULL DEFAULT '',
  "predictionError" TEXT NOT NULL DEFAULT '', "effectiveness" DOUBLE PRECISION,
  "nextAction" TEXT NOT NULL DEFAULT '', "confidenceUpdate" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DecisionReview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DecisionReview_workspaceId_decisionId_idx" ON "DecisionReview"("workspaceId", "decisionId");
