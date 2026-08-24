-- Rich-content layer: preview cache + trigram indexes (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ChatUnfurlCache (server-side OG + adapter metadata, TTL-aware)
CREATE TABLE IF NOT EXISTS "ChatUnfurlCache" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "siteName" TEXT,
    "structured" JSONB DEFAULT '{}',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "etag" TEXT,
    CONSTRAINT "ChatUnfurlCache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChatUnfurlCache_workspaceId_url_key" ON "ChatUnfurlCache"("workspaceId", "url");
CREATE INDEX IF NOT EXISTS "ChatUnfurlCache_workspaceId_kind_idx" ON "ChatUnfurlCache"("workspaceId", "kind");
CREATE INDEX IF NOT EXISTS "ChatUnfurlCache_expiresAt_idx" ON "ChatUnfurlCache"("expiresAt");
ALTER TABLE "ChatUnfurlCache" ADD CONSTRAINT "ChatUnfurlCache_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Speed up searchMessages body ILIKE (server.ts:1050)
CREATE INDEX IF NOT EXISTS "ChatMessage_body_trgm_idx" ON "ChatMessage" USING gin (body gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ChatMessage_authorName_trgm_idx" ON "ChatMessage" USING gin ("authorName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ChatSearchIndex_searchVector_trgm_idx" ON "ChatSearchIndex" USING gin ("searchVector" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ChatAttachment_workspaceId_id_idx" ON "ChatAttachment"("workspaceId", id);

