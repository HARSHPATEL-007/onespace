import { prisma, type Prisma } from "@n0va/db";
import { createHash } from "node:crypto";
import { AUDIT_ACTION } from "./constants";

export function sha3(input: string): string {
  return createHash("sha3-512").update(input, "utf8").digest("hex");
}

/** Deterministic JSON (recursively sorted keys) — JSONB reorders keys on store. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(",")}}`;
}

export interface ApprovalAuditInput {
  action: string;
  actorId?: string | null;
  actorName?: string | null;
  approvalId: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Append a tamper-evident entry to the workspace approval chain.
 * Canonical = [workspaceId, approvalId, actorId, action, from, to, details, ts]
 */
export async function auditAppend(workspaceId: string, entry: ApprovalAuditInput): Promise<void> {
  const last = await prisma.approvalAuditEntry.findFirst({
    where: { workspaceId },
    orderBy: { chainIndex: "desc" },
    select: { hash: true, chainIndex: true },
  });
  const chainPrev = last?.hash ?? null;
  const chainIndex = (last?.chainIndex ?? 0) + 1;
  // Drop undefined/non-JSON values so the hashed payload exactly matches what
  // Prisma persists in JSONB (JSONB drops undefined and reorders nothing).
  const details = JSON.parse(JSON.stringify(entry.details ?? {})) as Record<string, unknown>;
  const canonical = canonicalJson(details);
  const ts = new Date();
  const hashable = [
    workspaceId,
    entry.approvalId,
    entry.actorId ?? "",
    entry.action,
    entry.fromStatus ?? "",
    entry.toStatus ?? "",
    canonical,
    ts.toISOString(),
  ];
  const hash = sha3([...hashable, chainIndex, chainPrev ?? ""].join("|"));
  await prisma.approvalAuditEntry.create({
    data: {
      workspaceId,
      approvalId: entry.approvalId,
      actorId: entry.actorId ?? null,
      actorName: entry.actorName ?? null,
      action: entry.action,
      fromStatus: entry.fromStatus ?? null,
      toStatus: entry.toStatus ?? null,
details: details as Prisma.InputJsonValue,
      hash,
      chainPrev,
      chainIndex,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      createdAt: ts,
    },
  });
}

export interface BrokenLink {
  chainIndex: number;
  action: string;
  kind: "hash" | "prev";
  expected: string;
  actual: string;
}

/** Replay the chain and report any broken link. */
export async function verifyApprovalChain(
  workspaceId: string,
): Promise<{ valid: boolean; entries: number; broken: number; brokenAt?: BrokenLink[] }> {
  const logs = await prisma.approvalAuditEntry.findMany({
    where: { workspaceId },
    orderBy: { chainIndex: "asc" },
  });
  let prev: string | null = null;
  let broken = 0;
  const brokenAt: BrokenLink[] = [];
  for (const log of logs) {
    const canonical = [
      log.workspaceId,
      log.approvalId,
      log.actorId ?? "",
      log.action,
      log.fromStatus ?? "",
      log.toStatus ?? "",
      canonicalJson(log.details ?? {}),
      log.createdAt.toISOString(),
    ];
    const expected = sha3([...canonical, log.chainIndex, log.chainPrev ?? ""].join("|"));
    if (expected !== log.hash || prev !== log.chainPrev) {
      broken += 1;
      brokenAt.push({
        chainIndex: log.chainIndex,
        action: log.action,
        kind: expected !== log.hash ? "hash" : "prev",
        expected: expected !== log.hash ? expected : (log.chainPrev ?? ""),
        actual: expected !== log.hash ? log.hash : (prev ?? ""),
      });
    }
    prev = log.hash;
  }
  return { valid: broken === 0, entries: logs.length, broken, brokenAt: broken > 0 ? brokenAt : undefined };
}

/** Convenience: chain per approval (display order). */
export function entryForApproval(approvalId: string) {
  return prisma.approvalAuditEntry.findMany({
    where: { approvalId },
    orderBy: { chainIndex: "asc" },
  });
}

export { AUDIT_ACTION };
