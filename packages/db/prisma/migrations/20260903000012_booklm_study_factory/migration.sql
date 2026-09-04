-- N0VA BOOKLM+EDUCATION Study Factory: one verified model, many artifacts

DO $$ BEGIN CREATE TYPE "ArtifactReviewStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'SUPERSEDED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "StudyModel" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT NOT NULL,
  "nodes" JSONB NOT NULL, "sourceVersions" JSONB, "builtById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudyModel_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StudyModel_workspaceId_setId_idx" ON "StudyModel"("workspaceId", "setId");

CREATE TABLE IF NOT EXISTS "StudyArtifact" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT NOT NULL,
  "modelId" TEXT, "type" TEXT NOT NULL, "title" TEXT NOT NULL DEFAULT '',
  "content" JSONB NOT NULL, "sourceDocs" TEXT[] NOT NULL DEFAULT '{}',
  "sourceVersions" TEXT[] NOT NULL DEFAULT '{}',
  "concepts" TEXT[] NOT NULL DEFAULT '{}', "objectives" TEXT[] NOT NULL DEFAULT '{}',
  "audience" JSONB, "extractionConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "reviewStatus" "ArtifactReviewStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1, "createdById" TEXT, "reviewedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudyArtifact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StudyArtifact_workspaceId_setId_type_idx" ON "StudyArtifact"("workspaceId", "setId", "type");
