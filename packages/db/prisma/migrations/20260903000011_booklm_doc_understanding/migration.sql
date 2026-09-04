-- N0VA BOOKLM+EDUCATION Document Understanding: provenance-preserving extraction graph

DO $$ BEGIN CREATE TYPE "DocStatus" AS ENUM ('UPLOADED', 'VALIDATED', 'EXTRACTED', 'REVIEW_RECOMMENDED', 'VERIFIED', 'INCOMPLETE_POSSIBLE', 'CORRUPT'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "SourceDocument" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "setId" TEXT,
  "title" TEXT NOT NULL, "format" TEXT NOT NULL DEFAULT 'txt',
  "language" TEXT NOT NULL DEFAULT '', "pageCount" INTEGER,
  "fileHash" TEXT NOT NULL DEFAULT '', "fileBytes" INTEGER,
  "status" "DocStatus" NOT NULL DEFAULT 'UPLOADED',
  "quality" JSONB, "parserVersion" TEXT NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 1, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SourceDocument_workspaceId_setId_idx" ON "SourceDocument"("workspaceId", "setId");

CREATE TABLE IF NOT EXISTS "DocBlock" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "documentId" TEXT NOT NULL,
  "blockKey" TEXT NOT NULL, "kind" TEXT NOT NULL DEFAULT 'paragraph',
  "page" INTEGER NOT NULL DEFAULT 1, "readingOrder" INTEGER NOT NULL DEFAULT 0,
  "sectionPath" TEXT[] NOT NULL DEFAULT '{}', "text" TEXT NOT NULL DEFAULT '',
  "language" TEXT NOT NULL DEFAULT '', "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "method" TEXT NOT NULL DEFAULT '', "corrected" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocBlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DocBlock_documentId_blockKey_key" ON "DocBlock"("documentId", "blockKey");
CREATE INDEX IF NOT EXISTS "DocBlock_workspaceId_documentId_page_idx" ON "DocBlock"("workspaceId", "documentId", "page");

CREATE TABLE IF NOT EXISTS "DocTable" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "documentId" TEXT NOT NULL,
  "tableKey" TEXT NOT NULL, "caption" TEXT NOT NULL DEFAULT '',
  "headers" TEXT[] NOT NULL DEFAULT '{}', "cells" JSONB NOT NULL,
  "footnotes" TEXT[] NOT NULL DEFAULT '{}', "units" TEXT[] NOT NULL DEFAULT '{}',
  "page" INTEGER NOT NULL DEFAULT 1, "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "needsReview" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocTable_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DocTable_documentId_tableKey_key" ON "DocTable"("documentId", "tableKey");

CREATE TABLE IF NOT EXISTS "DocFormula" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "documentId" TEXT NOT NULL,
  "formulaKey" TEXT NOT NULL, "latex" TEXT NOT NULL DEFAULT '',
  "mathml" TEXT NOT NULL DEFAULT '', "plain" TEXT NOT NULL DEFAULT '',
  "variables" TEXT[] NOT NULL DEFAULT '{}', "page" INTEGER NOT NULL DEFAULT 1,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5, "validation" JSONB,
  "needsReview" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocFormula_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DocFormula_documentId_formulaKey_key" ON "DocFormula"("documentId", "formulaKey");

CREATE TABLE IF NOT EXISTS "DocFigure" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "documentId" TEXT NOT NULL,
  "figureKey" TEXT NOT NULL, "kind" TEXT NOT NULL DEFAULT 'figure',
  "caption" TEXT NOT NULL DEFAULT '', "nodes" JSONB, "edges" JSONB,
  "page" INTEGER NOT NULL DEFAULT 1, "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocFigure_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DocFigure_documentId_figureKey_key" ON "DocFigure"("documentId", "figureKey");

CREATE TABLE IF NOT EXISTS "DocCitation" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "documentId" TEXT NOT NULL,
  "citationKey" TEXT NOT NULL, "rawText" TEXT NOT NULL DEFAULT '',
  "normalized" JSONB, "citationType" TEXT NOT NULL DEFAULT 'unknown',
  "resolution" TEXT NOT NULL DEFAULT '', "page" INTEGER NOT NULL DEFAULT 1,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocCitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DocCitation_documentId_citationKey_key" ON "DocCitation"("documentId", "citationKey");

CREATE TABLE IF NOT EXISTS "DocCode" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "documentId" TEXT NOT NULL,
  "codeKey" TEXT NOT NULL, "language" TEXT NOT NULL DEFAULT '',
  "content" TEXT NOT NULL, "page" INTEGER NOT NULL DEFAULT 1,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "parseStatus" TEXT NOT NULL DEFAULT 'unknown', "warnings" TEXT[] NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DocCode_documentId_codeKey_key" ON "DocCode"("documentId", "codeKey");

CREATE TABLE IF NOT EXISTS "DocTranscript" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "documentId" TEXT NOT NULL,
  "segmentKey" TEXT NOT NULL, "startSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "endSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "speaker" TEXT NOT NULL DEFAULT 'speaker_1',
  "speakerConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "text" TEXT NOT NULL, "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "language" TEXT NOT NULL DEFAULT '', "linkedSlide" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocTranscript_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DocTranscript_documentId_segmentKey_key" ON "DocTranscript"("documentId", "segmentKey");
CREATE INDEX IF NOT EXISTS "DocTranscript_workspaceId_documentId_startSec_idx" ON "DocTranscript"("workspaceId", "documentId", "startSec");

CREATE TABLE IF NOT EXISTS "DocCorrection" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "documentId" TEXT NOT NULL,
  "location" TEXT NOT NULL DEFAULT '', "targetType" TEXT NOT NULL DEFAULT 'block',
  "targetId" TEXT NOT NULL DEFAULT '', "before" TEXT NOT NULL DEFAULT '',
  "after" TEXT NOT NULL DEFAULT '', "actorId" TEXT,
  "reason" TEXT NOT NULL DEFAULT '', "reindexStatus" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocCorrection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DocCorrection_workspaceId_documentId_idx" ON "DocCorrection"("workspaceId", "documentId");

CREATE TABLE IF NOT EXISTS "DocVersion" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "documentId" TEXT NOT NULL,
  "version" INTEGER NOT NULL, "snapshot" JSONB NOT NULL, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DocVersion_documentId_version_key" ON "DocVersion"("documentId", "version");
