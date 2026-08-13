/**
 * Idempotency guard: consumers may see the same event more than once
 * (at-least-once brokers, retries). Records keyed (handlerKey, eventId)
 * make handlers run exactly once per event.
 */
import { prisma } from "@n0va/db";

export type IdempotencyOutcome = "processed" | "deduped";

/** Returns "processed" on first sight, "deduped" when already handled. */
export async function ensureProcessedOnce(handlerKey: string, eventId: string, ttlDays = 30): Promise<IdempotencyOutcome> {
  const existing = await prisma.idempotencyRecord.findUnique({
    where: { handlerKey_eventId: { handlerKey, eventId } },
  });
  if (existing) return "deduped";
  try {
    await prisma.idempotencyRecord.create({
      data: {
        handlerKey,
        eventId,
        status: "APPLIED",
        expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
      },
    });
    return "processed";
  } catch {
    return "deduped"; // concurrent create lost the race
  }
}

/** Purge expired keys; call on an interval. */
export async function sweepIdempotency(): Promise<number> {
  const result = await prisma.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return result.count;
}