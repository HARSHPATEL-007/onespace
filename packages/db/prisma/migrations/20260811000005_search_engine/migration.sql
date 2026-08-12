-- Search Engine: Hybrid Retrieval System

DO $$ BEGIN CREATE TYPE "SearchContentType" AS ENUM ('MESSAGE','THREAD','THREAD_SUMMARY','DECISION','ACTION_ITEM','PIN','BOOKMARK','ATTACHMENT','LIVE_EMBED','CONTACT','MEETING','NOTIFICATION'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "SearchQueryType" AS ENUM ('NATURAL','KEYWORD','SEMANTIC','HYBRID','OPERATOR'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE "SearchIndex" (
    "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "contentType" "SearchContentType" NOT NULL, "contentId" TEXT NOT NULL,
    "title" TEXT NOT NULL, "body" TEXT NOT NULL, "excerpt" TEXT NOT NULL DEFAULT '', "embedding" TEXT NOT NULL DEFAULT '',
    "embeddingModel" TEXT NOT NULL DEFAULT 'n0va-embed-v3', "lexicalVector" TEXT NOT NULL DEFAULT '',
    "entities" JSONB NOT NULL DEFAULT '[]', "metadata" JSONB NOT NULL DEFAULT '{}', "permissions" JSONB NOT NULL DEFAULT '{}',
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SearchIndex_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "SearchIndex_workspaceId_contentType_contentId_key" ON "SearchIndex"("workspaceId", "contentType", "contentId");
CREATE INDEX "SearchIndex_workspaceId_contentType_idx" ON "SearchIndex"("workspaceId", "contentType");
ALTER TABLE "SearchIndex" ADD CONSTRAINT "SearchIndex_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SearchQueryLog" (
    "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL, "query" TEXT NOT NULL, "queryType" "SearchQueryType" NOT NULL DEFAULT 'NATURAL',
    "filters" JSONB NOT NULL DEFAULT '{}', "resultCount" INTEGER NOT NULL DEFAULT 0, "topScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0, "clickedResults" TEXT[] NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SearchQueryLog_pkey" PRIMARY KEY ("id"));
CREATE INDEX "SearchQueryLog_workspaceId_createdAt_idx" ON "SearchQueryLog"("workspaceId", "createdAt" DESC);
CREATE INDEX "SearchQueryLog_userId_createdAt_idx" ON "SearchQueryLog"("userId", "createdAt" DESC);
ALTER TABLE "SearchQueryLog" ADD CONSTRAINT "SearchQueryLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SearchQueryLog" ADD CONSTRAINT "SearchQueryLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SearchSuggestion" (
    "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "query" TEXT NOT NULL, "suggestion" TEXT NOT NULL, "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usageCount" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SearchSuggestion_pkey" PRIMARY KEY ("id"));
CREATE INDEX "SearchSuggestion_workspaceId_score_idx" ON "SearchSuggestion"("workspaceId", "score" DESC);
ALTER TABLE "SearchSuggestion" ADD CONSTRAINT "SearchSuggestion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
