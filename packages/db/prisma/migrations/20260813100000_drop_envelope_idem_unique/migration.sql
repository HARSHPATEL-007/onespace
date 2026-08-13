-- Idempotency is enforced by the IdempotencyRecord registry (handlerKey+eventId);
-- the envelope's idempotencyKey is informational and may repeat across a causal
-- chain (a command propagates its key to every caused event).
-- Prisma may have emitted this as a constraint OR a bare unique index.
ALTER TABLE "EventEnvelope" DROP CONSTRAINT IF EXISTS "EventEnvelope_idempotencyKey_key";
DROP INDEX IF EXISTS "public"."EventEnvelope_idempotencyKey_key";
