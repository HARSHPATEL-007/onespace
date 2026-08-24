-- N0VA CHAT real-use hardening: pg_trgm for search, pin limit already code-enforced, attachment tenant isolation fix is code-only
-- Enable trigram extension for LIKE/ILIKE acceleration (requires superuser, safe to ignore if exists)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Speed up searchMessages body ILIKE (server.ts:1050 contains insensitive)
CREATE INDEX IF NOT EXISTS "ChatMessage_body_trgm_idx" ON "ChatMessage" USING gin (body gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ChatMessage_authorName_trgm_idx" ON "ChatMessage" USING gin ("authorName" gin_trgm_ops);

-- Speed up ChatSearchIndex searchVector lookups
CREATE INDEX IF NOT EXISTS "ChatSearchIndex_searchVector_trgm_idx" ON "ChatSearchIndex" USING gin ("searchVector" gin_trgm_ops);

-- Ensure ChatAttachment workspace isolation benefits from existing workspaceId but add composite for download path
CREATE INDEX IF NOT EXISTS "ChatAttachment_workspaceId_id_idx" ON "ChatAttachment"("workspaceId", id);

