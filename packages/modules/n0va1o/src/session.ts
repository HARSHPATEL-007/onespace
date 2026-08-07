/**
 * N0VA1O Session Memory Controls — core platform (spec §4.4).
 *
 * Separates short-lived LLM context from durable workflow state. Retention
 * periods, redaction rules, and replay permissions are configurable per tenant.
 * Sensitive state is excluded from long-term memory unless explicitly approved
 * by policy.
 */

export type Sensitivity = "public" | "internal" | "confidential" | "restricted";

export interface MemoryEntry {
  id: string;
  sessionId: string;
  content: string;
  sensitivity: Sensitivity;
  /** Whether this entry may be replayed into future sessions. */
  replayable: boolean;
  createdAt: string;
  /** Ephemeral entries expire from short-term context after this many ms. */
  ttlMs: number;
}

export interface RetentionPolicy {
  /** How long ephemeral LLM context is retained (ms). */
  ephemeralTtlMs: number;
  /** How long durable workflow state is retained (ms). */
  durableRetentionMs: number;
  /** Sensitivity levels excluded from long-term memory. */
  excludeFromLongTerm: Sensitivity[];
  /** Whether replay requires explicit approval. */
  replayRequiresApproval: boolean;
}

export const DEFAULT_RETENTION: RetentionPolicy = {
  ephemeralTtlMs: 60 * 60 * 1000, // 1 hour
  durableRetentionMs: 90 * 24 * 60 * 60 * 1000, // 90 days
  excludeFromLongTerm: ["confidential", "restricted"],
  replayRequiresApproval: true,
};

const SENSITIVITY_RANK: Record<Sensitivity, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

/** Redact sensitive fields from a content string based on sensitivity. */
export function redact(content: string, sensitivity: Sensitivity): string {
  if (sensitivity === "public") return content;
  let redacted = content;
  // Redact tokens, keys, emails, and secrets.
  redacted = redacted.replace(/\bBearer\s+[A-Za-z0-9._-]{16,}/g, "Bearer <redacted>");
  // Redact key=value style credentials (e.g. token=abc123).
  redacted = redacted.replace(/\b(token|secret|api[_-]?key|password|auth)\s*[:=]\s*[A-Za-z0-9._-]{12,}/gi, "$1=<redacted>");
  redacted = redacted.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}/g, "<email-redacted>");
  if (sensitivity === "restricted") {
    // For restricted content, redact anything that looks like a value after a key.
    redacted = redacted.replace(/(["']?(?:token|secret|password|key|auth)["']?\s*[:=]\s*["']?)[^"'\s,}]+/gi, "$1<redacted>");
  }
  return redacted;
}

/** Whether an entry may be stored in long-term durable memory. */
export function isAllowedInLongTerm(entry: Pick<MemoryEntry, "sensitivity">, policy: RetentionPolicy): boolean {
  return !policy.excludeFromLongTerm.includes(entry.sensitivity);
}

/** Whether an entry may be replayed into a future session. */
export function canReplay(entry: MemoryEntry, policy: RetentionPolicy): boolean {
  if (!entry.replayable) return false;
  if (policy.replayRequiresApproval && SENSITIVITY_RANK[entry.sensitivity] >= SENSITIVITY_RANK.confidential) {
    return false;
  }
  return true;
}

/** Filter entries that have expired from short-term context. */
export function filterExpired(entries: MemoryEntry[], now = Date.now()): MemoryEntry[] {
  return entries.filter((e) => now - new Date(e.createdAt).getTime() < e.ttlMs);
}

/** Apply retention: drop expired ephemeral entries and strip sensitive ones from long-term. */
export function applyRetention(
  entries: MemoryEntry[],
  policy: RetentionPolicy,
  now = Date.now(),
): { ephemeral: MemoryEntry[]; durable: MemoryEntry[] } {
  const ephemeral = filterExpired(entries, now);
  const durable = entries.filter((e) => isAllowedInLongTerm(e, policy));
  return { ephemeral, durable };
}
