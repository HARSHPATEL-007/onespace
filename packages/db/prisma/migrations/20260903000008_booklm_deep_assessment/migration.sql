-- N0VA BOOKLM+EDUCATION Deep Assessment: dimension evidence + blueprints

ALTER TABLE "QuizAttempt" ADD COLUMN IF NOT EXISTS "dimension" TEXT NOT NULL DEFAULT '';
ALTER TABLE "QuizAttempt" ADD COLUMN IF NOT EXISTS "condition" JSONB;
ALTER TABLE "QuizResponse" ADD COLUMN IF NOT EXISTS "dimension" TEXT NOT NULL DEFAULT '';
ALTER TABLE "QuizResponse" ADD COLUMN IF NOT EXISTS "subscores" JSONB;
ALTER TABLE "QuizResponse" ADD COLUMN IF NOT EXISTS "supportLevel" TEXT NOT NULL DEFAULT 'independent';
ALTER TABLE "QuizResponse" ADD COLUMN IF NOT EXISTS "transferLevel" INTEGER;
ALTER TABLE "QuizResponse" ADD COLUMN IF NOT EXISTS "conditionLabel" TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS "AssessmentBlueprint" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT NOT NULL,
  "objective" TEXT NOT NULL, "weights" JSONB NOT NULL, "minimums" JSONB NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentBlueprint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AssessmentBlueprint_workspaceId_setId_objective_key" ON "AssessmentBlueprint"("workspaceId", "setId", "objective");
