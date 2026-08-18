-- Add OAuth refresh token support to IntegrationConnection
-- Guarded: the table is created later (20260810082458_n0va1o_connection_fix),
-- which already includes these columns. This keeps fresh deployments from
-- failing on the out-of-order ALTER while remaining a no-op everywhere else.
ALTER TABLE IF EXISTS "IntegrationConnection" ADD COLUMN IF NOT EXISTS "refreshToken" TEXT;
ALTER TABLE IF EXISTS "IntegrationConnection" ADD COLUMN IF NOT EXISTS "refreshTokenExpiresAt" TIMESTAMP(3);
