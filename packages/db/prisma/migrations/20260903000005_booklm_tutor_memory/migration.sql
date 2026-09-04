-- N0VA BOOKLM+EDUCATION Tutor Memory: hierarchy, classroom namespace, audit

DO $$ BEGIN CREATE TYPE "MemoryScope" AS ENUM ('TASK', 'SESSION', 'COURSE', 'LONG_TERM', 'CLASSROOM', 'TENANT', 'SYSTEM'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "MemoryStatus" AS ENUM ('CANDIDATE', 'PROPOSED', 'CONFIRMED', 'ACTIVE', 'REVALIDATED', 'STALE', 'EXPIRED', 'DELETED', 'ARCHIVED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "MemoryClassification" AS ENUM ('TASK_LOCAL', 'SESSION_DERIVED', 'LEARNER_DECLARED', 'INSTRUCTOR_VERIFIED', 'ASSESSMENT_DERIVED', 'COURSE_SCOPED', 'CLASSROOM_SHARED', 'TENANT_POLICY', 'SYSTEM_POLICY', 'SENSITIVE', 'UNTRUSTED_DOCUMENT', 'MODEL_HYPOTHESIS'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ClassroomMemoryStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REVOKED', 'SUPERSEDED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "MemoryRecord" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "profileId" TEXT,
  "scope" "MemoryScope" NOT NULL DEFAULT 'SESSION',
  "type" TEXT NOT NULL DEFAULT 'learner_attribute',
  "key" TEXT NOT NULL, "value" TEXT NOT NULL DEFAULT '', "valueJson" JSONB,
  "status" "MemoryStatus" NOT NULL DEFAULT 'ACTIVE',
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "confidenceLevel" TEXT NOT NULL DEFAULT 'weak',
  "provenance" JSONB, "evidenceRefs" TEXT[] NOT NULL DEFAULT '{}',
  "lastVerifiedAt" TIMESTAMP(3), "lastUsedAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3),
  "visibility" TEXT NOT NULL DEFAULT 'learner_only',
  "deletionPolicy" TEXT NOT NULL DEFAULT 'learner_controlled',
  "version" INTEGER NOT NULL DEFAULT 1,
  "classification" "MemoryClassification" NOT NULL DEFAULT 'SESSION_DERIVED',
  "sensitive" BOOLEAN NOT NULL DEFAULT false,
  "courseId" TEXT, "sectionId" TEXT,
  "paused" BOOLEAN NOT NULL DEFAULT false, "tombstoneOf" TEXT, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemoryRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MemoryRecord_workspaceId_ownerId_scope_status_idx" ON "MemoryRecord"("workspaceId", "ownerId", "scope", "status");
CREATE INDEX IF NOT EXISTS "MemoryRecord_workspaceId_courseId_scope_status_idx" ON "MemoryRecord"("workspaceId", "courseId", "scope", "status");
CREATE INDEX IF NOT EXISTS "MemoryRecord_workspaceId_expiresAt_idx" ON "MemoryRecord"("workspaceId", "expiresAt");

CREATE TABLE IF NOT EXISTS "ClassroomMemory" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT NOT NULL,
  "section" TEXT NOT NULL DEFAULT 'default', "key" TEXT NOT NULL, "value" TEXT NOT NULL,
  "status" "ClassroomMemoryStatus" NOT NULL DEFAULT 'PROPOSED',
  "version" INTEGER NOT NULL DEFAULT 1,
  "proposedById" TEXT, "approvedById" TEXT, "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClassroomMemory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ClassroomMemory_workspaceId_setId_section_status_idx" ON "ClassroomMemory"("workspaceId", "setId", "section", "status");

CREATE TABLE IF NOT EXISTS "MemoryEvent" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "memoryId" TEXT,
  "operation" TEXT NOT NULL, "actor" TEXT NOT NULL DEFAULT '', "actorRole" TEXT NOT NULL DEFAULT '',
  "policyResult" TEXT NOT NULL DEFAULT '', "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemoryEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MemoryEvent_workspaceId_memoryId_createdAt_idx" ON "MemoryEvent"("workspaceId", "memoryId", "createdAt");
CREATE INDEX IF NOT EXISTS "MemoryEvent_workspaceId_operation_idx" ON "MemoryEvent"("workspaceId", "operation");
