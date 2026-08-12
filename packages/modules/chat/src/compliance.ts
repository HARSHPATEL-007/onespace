import { createHash, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma, type Prisma } from "@n0va/db";

// ── Compliance / governance engine for chat artifacts ──────────────────

export type ClassificationLabel = "" | "CONFIDENTIAL" | "TOP_SECRET" | "CLIENT_RESTRICTED" | "LEGAL_MATTER" | "PII";

export interface ClassificationResult {
  label: ClassificationLabel;
  source: "AUTO" | "MANUAL" | "INHERITED";
}

export const RETENTION_TIERS = ["STANDARD", "EXTENDED", "COMPLIANCE", "GOVERNANCE", "BLOCKCHAIN", "LEGAL_HOLD"] as const;
export type RetentionTier = (typeof RETENTION_TIERS)[number];

export const ARTIFACT_TYPES = ["MESSAGE", "FILE", "EXPORT", "AI_ARTIFACT"] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const GOVERNANCE_ROLES = ["COMPLIANCE_OFFICER", "SECURITY_ADMIN", "LEGAL_ADMIN", "AUDITOR", "GUEST"] as const;
export type GovernanceRole = (typeof GOVERNANCE_ROLES)[number];

export const APPROVAL_ACTIONS = ["LOWER_RETENTION", "REMOVE_LEGAL_HOLD", "EXPORT_CONFIDENTIAL", "DISABLE_WATERMARK", "GRANT_TENANT_ACCESS"] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

const AUTO_MARKERS: Array<[RegExp, ClassificationLabel]> = [
  [/\bconfidential\b/i, "CONFIDENTIAL"],
  [/\btop secret\b/i, "TOP_SECRET"],
  [/\bclassified\b/i, "TOP_SECRET"],
  [/\beyes only\b/i, "CONFIDENTIAL"],
  [/\binternal use only\b/i, "CONFIDENTIAL"],
  [/\bdo not distribute\b/i, "CONFIDENTIAL"],
  [/\bclient[- ]restricted\b/i, "CLIENT_RESTRICTED"],
  [/\blegal matter\b/i, "LEGAL_MATTER"],
  [/\battorney[- ]client\b/i, "LEGAL_MATTER"],
  [/\bprivileged\b/i, "LEGAL_MATTER"],
  [/\bHIPAA\b/i, "PII"],
  [/\bmedical record\b/i, "PII"],
  [/\bpassport no[.:]?\s*\S{4,}/i, "PII"],
  [/\b\$\s?\d{6,}\b/, "CONFIDENTIAL"],
];

const CREDIT_CARD_RE = /\b(?:\d[ -]?){13,19}\d\b/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const API_KEY_PATTERNS: Array<[RegExp, string]> = [
  [/\bsk-[A-Za-z0-9]{20,}\b/g, "OpenAI API key"],
  [/\bghp_[A-Za-z0-9]{36}\b/g, "GitHub personal access token"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "GitHub fine-grained token"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "Slack token"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "AWS access key"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, "Google API key"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "JWT token"],
];

// ── Hashing ─────────────────────────────────────────────────────────────

export function sha3(input: string): string {
  return createHash("sha3-512").update(input, "utf8").digest("hex");
}

export function hashCanonical(parts: Array<string | number | null | undefined>): string {
  return sha3(parts.map((p) => p ?? "").join("|"));
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// ── Classification engine ───────────────────────────────────────────────

export function classifyContent(ctx: {
  channelClassification?: string | null;
  channelName?: string;
  channelTopic?: string;
  body: string;
  parentClassification?: string | null;
}): ClassificationResult {
  if (ctx.parentClassification) {
    return { label: ctx.parentClassification as ClassificationLabel, source: "INHERITED" };
  }
  if (ctx.channelClassification) {
    return { label: ctx.channelClassification as ClassificationLabel, source: "INHERITED" };
  }
  const haystack = `${ctx.channelName ?? ""} ${ctx.channelTopic ?? ""} ${ctx.body}`;
  for (const [re, label] of AUTO_MARKERS) {
    if (re.test(haystack)) return { label, source: "AUTO" };
  }
  return { label: "", source: "AUTO" };
}

// ── DLP redaction (exports and summaries) ───────────────────────────────

export function redactSensitive(text: string): string {
  let out = text;
  const ccMatches = text.match(CREDIT_CARD_RE) ?? [];
  for (const raw of ccMatches) {
    const digits = raw.replace(/[^0-9]/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      out = out.split(raw).join("****-****-****-" + digits.slice(-4));
    }
  }
  const ssnMatches = text.match(SSN_RE) ?? [];
  for (const m of ssnMatches) {
    out = out.split(m).join("***-**-" + m.slice(-4));
  }
  for (const [re, label] of API_KEY_PATTERNS) {
    out = out.replace(re, (m) => `${label.slice(0, 3).toLowerCase()}••••${m.slice(-4)}`);
  }
  return out;
}

// ── Retention engine ────────────────────────────────────────────────────

const DEFAULT_POLICIES: Array<{ tier: RetentionTier; scope: ArtifactType; name: string; durationDays: number | null }> = [
  { tier: "STANDARD", scope: "MESSAGE", name: "Standard message retention", durationDays: 90 },
  { tier: "STANDARD", scope: "FILE", name: "Standard file retention", durationDays: 30 },
  { tier: "STANDARD", scope: "EXPORT", name: "Standard export retention", durationDays: 180 },
  { tier: "STANDARD", scope: "AI_ARTIFACT", name: "Standard AI artifact retention", durationDays: 180 },
  { tier: "EXTENDED", scope: "MESSAGE", name: "Extended message retention", durationDays: 365 },
  { tier: "EXTENDED", scope: "FILE", name: "Extended file retention", durationDays: 365 },
  { tier: "EXTENDED", scope: "EXPORT", name: "Extended export retention", durationDays: 730 },
  { tier: "EXTENDED", scope: "AI_ARTIFACT", name: "Extended AI artifact retention", durationDays: 730 },
  { tier: "COMPLIANCE", scope: "MESSAGE", name: "Compliance message retention", durationDays: 730 },
  { tier: "COMPLIANCE", scope: "FILE", name: "Compliance file retention", durationDays: 730 },
  { tier: "COMPLIANCE", scope: "EXPORT", name: "Compliance export retention", durationDays: 1460 },
  { tier: "COMPLIANCE", scope: "AI_ARTIFACT", name: "Compliance AI artifact retention", durationDays: 1460 },
  { tier: "GOVERNANCE", scope: "MESSAGE", name: "Governance message retention", durationDays: null },
  { tier: "GOVERNANCE", scope: "FILE", name: "Governance file retention", durationDays: null },
  { tier: "GOVERNANCE", scope: "EXPORT", name: "Governance export retention", durationDays: null },
  { tier: "GOVERNANCE", scope: "AI_ARTIFACT", name: "Governance AI artifact retention", durationDays: null },
  { tier: "BLOCKCHAIN", scope: "MESSAGE", name: "Hash-chained evidence (append-only)", durationDays: null },
  { tier: "BLOCKCHAIN", scope: "EXPORT", name: "Hash-chained evidence export", durationDays: null },
  { tier: "LEGAL_HOLD", scope: "MESSAGE", name: "Legal hold (until released)", durationDays: null },
  { tier: "LEGAL_HOLD", scope: "FILE", name: "Legal hold file (until released)", durationDays: null },
];

export async function ensurePolicies(workspaceId: string) {
  for (const p of DEFAULT_POLICIES) {
    await prisma.chatRetentionPolicy.upsert({
      where: { workspaceId_tier_scope: { workspaceId, tier: p.tier, scope: p.scope } },
      create: { workspaceId, ...p },
      update: {},
    });
  }
}

export async function getPolicy(workspaceId: string, tier: RetentionTier, scope: ArtifactType) {
  const policy = await prisma.chatRetentionPolicy.findUnique({
    where: { workspaceId_tier_scope: { workspaceId, tier, scope } },
  });
  return policy ?? (await prisma.chatRetentionPolicy.create({
    data: { workspaceId, tier, scope, name: `${tier} ${scope}`.toLowerCase(), durationDays: null },
  }));
}

export function computeRetainUntil(policy: { anchor: string; durationDays: number | null }, anchorDate = new Date()): Date | null {
  if (policy.anchor === "CLOSURE") return null;
  if (!policy.durationDays) return null;
  return new Date(anchorDate.getTime() + policy.durationDays * 86_400_000);
}

// ── Compliance config ───────────────────────────────────────────────────

export async function getConfig(workspaceId: string) {
  return prisma.chatComplianceConfig.upsert({
    where: { workspaceId },
    create: { workspaceId },
    update: {},
  });
}

// ── Key envelope (AES-256-GCM, HSM-style master key from env) ───────────

function masterKey(): Buffer {
  const secret = process.env.N0VA_CHAT_MASTER_KEY ?? "n0va-chat-dev-master-key-do-not-use-in-prod";
  return createHash("sha256").update(secret).digest();
}

export async function getEnvelope(workspaceId: string, purpose: "PRODUCTION" | "BACKUP" | "LEGAL_HOLD_VAULT") {
  const existing = await prisma.chatKeyRecord.findUnique({ where: { workspaceId_purpose: { workspaceId, purpose } } });
  if (existing) return unwrapEnvelope(existing);
  const mk = masterKey();
  const dataKey = randomBytes(32);
  const iv = randomBytes(12);
  const aad = Buffer.from(`n0va-chat:${purpose}:v1`);
  const cipher = createCipheriv("aes-256-gcm", mk, iv);
  cipher.setAAD(aad);
  const enc = Buffer.concat([cipher.update(dataKey), cipher.final()]);
  const tag = cipher.getAuthTag();
  const rec = await prisma.chatKeyRecord.create({
    data: {
      workspaceId,
      purpose,
      algorithm: "AES-256-GCM",
      keyVersion: 1,
      wrappedKey: enc.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      masterKeyVersion: 1,
    },
  });
  return unwrapEnvelope(rec);
}

async function unwrapEnvelope(rec: { id: string; workspaceId: string; purpose: string; algorithm: string; keyVersion: number; wrappedKey: string; iv: string; tag: string; masterKeyVersion: number; pqReady: boolean; pqRequired: boolean }) {
  const mk = masterKey();
  const decipher = createDecipheriv("aes-256-gcm", mk, Buffer.from(rec.iv, "base64"));
  decipher.setAAD(Buffer.from(`n0va-chat:${rec.purpose}:v${rec.masterKeyVersion}`));
  decipher.setAuthTag(Buffer.from(rec.tag, "base64"));
  const dataKey = Buffer.concat([decipher.update(Buffer.from(rec.wrappedKey, "base64")), decipher.final()]);
  return {
    id: rec.id,
    workspaceId: rec.workspaceId,
    purpose: rec.purpose as "PRODUCTION" | "BACKUP" | "LEGAL_HOLD_VAULT",
    algorithm: rec.algorithm,
    keyVersion: rec.keyVersion,
    masterKeyVersion: rec.masterKeyVersion,
    pqReady: rec.pqReady,
    pqRequired: rec.pqRequired,
    dataKey,
    algTag: `${rec.algorithm}/v${rec.masterKeyVersion}/dk${rec.keyVersion}`,
  };
}

export async function rotateMasterKey(workspaceId: string) {
  const records = await prisma.chatKeyRecord.findMany({ where: { workspaceId } });
  const mk = masterKey();
  const nextVersion = Math.max(0, ...records.map((r) => r.masterKeyVersion)) + 1;
  for (const rec of records) {
    const prev = await unwrapEnvelope(rec);
    const iv = randomBytes(12);
    const aad = Buffer.from(`n0va-chat:${rec.purpose}:v${nextVersion}`);
    const cipher = createCipheriv("aes-256-gcm", mk, iv);
    cipher.setAAD(aad);
    const enc = Buffer.concat([cipher.update(prev.dataKey), cipher.final()]);
    const tag = cipher.getAuthTag();
    await prisma.chatKeyRecord.update({
      where: { id: rec.id },
      data: {
        wrappedKey: enc.toString("base64"),
        iv: iv.toString("base64"),
        tag: tag.toString("base64"),
        masterKeyVersion: nextVersion,
        rotatedAt: new Date(),
        pqReady: prev.pqReady,
      },
    });
  }
  return { masterKeyVersion: nextVersion, reWrapped: records.length };
}

export function encryptBundle(data: Buffer, envelope: Awaited<ReturnType<typeof getEnvelope>>, aadInput: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", envelope.dataKey, iv);
  cipher.setAAD(Buffer.from(sha3(aadInput).slice(0, 64), "utf8"));
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    algorithm: envelope.algorithm,
    keyVersion: envelope.keyVersion,
    masterKeyVersion: envelope.masterKeyVersion,
    pqReady: envelope.pqReady,
    algTag: envelope.algTag,
  };
}

export function decryptBundle(bundle: { ciphertext: string; iv: string; tag: string }, envelope: Awaited<ReturnType<typeof getEnvelope>>, aadInput: string) {
  const decipher = createDecipheriv("aes-256-gcm", envelope.dataKey, Buffer.from(bundle.iv, "base64"));
  decipher.setAAD(Buffer.from(sha3(aadInput).slice(0, 64), "utf8"));
  decipher.setAuthTag(Buffer.from(bundle.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(bundle.ciphertext, "base64")), decipher.final()]);
}

// ── Tamper-evident audit chain (sha3-512) ───────────────────────────────

export interface AuditEntryInput {
  workspaceId: string;
  actorId: string;
  actorName?: string;
  action: string;
  objectType?: string;
  objectId?: string;
  channelId?: string;
  outcome?: "SUCCESS" | "DENIED";
  policyApplied?: string;
  ip?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

export async function auditAppend(entry: AuditEntryInput): Promise<{ hash: string; chainPrev: string | null; chainIndex: number }> {
  const last = await prisma.chatAuditLog.findFirst({
    where: { workspaceId: entry.workspaceId },
    orderBy: { chainIndex: "desc" },
    select: { hash: true, chainIndex: true },
  });
  const chainPrev = last?.hash ?? null;
  const chainIndex = (last?.chainIndex ?? 0) + 1;
  const details = JSON.stringify(entry.details ?? {});
  const canonical = [
    entry.workspaceId,
    entry.actorId,
    entry.action,
    entry.objectType ?? "",
    entry.objectId ?? "",
    entry.channelId ?? "",
    entry.outcome ?? "SUCCESS",
    entry.policyApplied ?? "",
    entry.ip ?? "",
    entry.userAgent ?? "",
    details,
    new Date().toISOString(),
  ];
  const hash = hashCanonical([...canonical, chainIndex, chainPrev ?? ""]);
  await prisma.chatAuditLog.create({
    data: {
      workspaceId: entry.workspaceId,
      actorId: entry.actorId,
      actorName: entry.actorName,
      action: entry.action,
      objectType: entry.objectType,
      objectId: entry.objectId,
      channelId: entry.channelId,
      outcome: entry.outcome ?? "SUCCESS",
      policyApplied: entry.policyApplied,
      ip: entry.ip,
      userAgent: entry.userAgent,
      details: (entry.details ?? {}) as Prisma.InputJsonValue,
      hash,
      chainPrev,
      chainIndex,
    },
  });
  return { hash, chainPrev, chainIndex };
}

export async function verifyAuditChain(workspaceId: string): Promise<{ broken: Array<{ chainIndex: number; expectedHash: string; actualHash: string }>; entries: number; valid: boolean }> {
  const logs = await prisma.chatAuditLog.findMany({
    where: { workspaceId },
    orderBy: { chainIndex: "asc" },
  });
  const broken: Array<{ chainIndex: number; expectedHash: string; actualHash: string }> = [];
  let prev: string | null = null;
  for (const log of logs) {
    const details = JSON.stringify(log.details ?? {});
    const canonical = [
      log.workspaceId,
      log.actorId,
      log.action,
      log.objectType ?? "",
      log.objectId ?? "",
      log.channelId ?? "",
      log.outcome,
      log.policyApplied ?? "",
      log.ip ?? "",
      log.userAgent ?? "",
      details,
      log.createdAt.toISOString(),
    ];
    const expected = hashCanonical([...canonical, log.chainIndex, log.chainPrev ?? ""]);
    if (expected !== log.hash || (log.chainIndex > 1 && log.chainPrev !== prev)) {
      broken.push({ chainIndex: log.chainIndex, expectedHash: expected, actualHash: log.hash });
    }
    prev = log.hash;
  }
  return { broken, entries: logs.length, valid: broken.length === 0 };
}

// ── Watermarking ────────────────────────────────────────────────────────

export function watermarkPayload(opts: {
  workspaceId: string;
  workspaceName: string;
  config: { watermarkStyle: string; watermarkViewerScope: string; externalStronger: boolean };
  objectId: string;
  objectType: string;
  viewerId: string;
  viewerName: string;
  viewerEmail: string;
  version: number;
  external?: boolean;
}) {
  const token = createHash("sha256")
    .update(`${opts.workspaceId}|${opts.objectId}|${opts.viewerId}|${opts.version}`)
    .digest("hex")
    .slice(0, 16);
  const stronger = opts.external && opts.config.externalStronger;
  const lines = [
    `${opts.viewerName} <${opts.viewerEmail}>`,
    `object: ${opts.objectType}:${opts.objectId.slice(0, 8)} v${opts.version}`,
    `workspace: ${opts.workspaceName}`,
    `time: ${new Date().toISOString()}`,
  ];
  if (stronger) lines.push(`trace: ${opts.viewerId} · ${token}`);
  return {
    style: opts.config.watermarkStyle,
    viewerScope: opts.config.watermarkViewerScope,
    external: !!opts.external,
    stronger,
    lines,
    token,
  };
}

// ── WORM enforcement ────────────────────────────────────────────────────

export function assertMutable(rec: {
  retentionMode: string;
  retainUntil: Date | null;
  legalHold: boolean;
  legalHoldReason: string | null;
}, opts: { privilegedBypass: boolean }): void {
  if (rec.retentionMode === "BLOCKCHAIN") {
    throw new Error("CHAT_012 This record is part of an append-only evidence chain and cannot be modified or deleted");
  }
  if (rec.legalHold) {
    throw new Error(`CHAT_010 This record is under legal hold: ${rec.legalHoldReason || "held until explicitly released"}`);
  }
  if (rec.retentionMode === "COMPLIANCE" || rec.retentionMode === "GOVERNANCE") {
    if (rec.retainUntil && rec.retainUntil.getTime() > Date.now()) {
      if (rec.retentionMode === "GOVERNANCE" && opts.privilegedBypass) return;
      throw new Error(`CHAT_009 This record is under a ${rec.retentionMode.toLowerCase()} retention lock until ${rec.retainUntil.toISOString().slice(0, 10)} (${rec.retentionMode} mode)`);
    }
  }
}

// ── Governance roles and approvals ──────────────────────────────────────

const ACTION_ROLES: Record<ApprovalAction, GovernanceRole[]> = {
  LOWER_RETENTION: ["COMPLIANCE_OFFICER"],
  REMOVE_LEGAL_HOLD: ["LEGAL_ADMIN"],
  EXPORT_CONFIDENTIAL: ["LEGAL_ADMIN", "COMPLIANCE_OFFICER"],
  DISABLE_WATERMARK: ["SECURITY_ADMIN"],
  GRANT_TENANT_ACCESS: ["SECURITY_ADMIN"],
};

export async function govRoleOf(workspaceId: string, userId: string): Promise<GovernanceRole | null> {
  const assignment = await prisma.chatGovernanceAssignment.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  return assignment?.role ?? null;
}

export async function assertGovernanceRole(workspaceId: string, userId: string, roles: GovernanceRole[]) {
  const role = await govRoleOf(workspaceId, userId);
  if (!role || !roles.includes(role)) {
    throw new Error(`CHAT_013 Requires governance role: ${roles.join(" or ")}`);
  }
  return role;
}

export async function ensureApproval(workspaceId: string, userId: string, action: ApprovalAction, objectId?: string, objectType?: string) {
  const allowed = ACTION_ROLES[action];
  const role = await govRoleOf(workspaceId, userId);
  if (role && allowed.includes(role)) return;
  const approved = await prisma.chatApproval.findFirst({
    where: {
      workspaceId,
      action,
      status: "APPROVED",
      ...(objectId ? { objectId } : {}),
      reviewedAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
    },
  });
  if (!approved) {
    throw new Error(`CHAT_011 This action requires approval (${action}). Submit a request with rationale first.`);
  }
}

export async function requestApproval(workspaceId: string, userId: string, action: ApprovalAction, rationale: string, objectId?: string, objectType?: ArtifactType) {
  return prisma.chatApproval.create({
    data: { workspaceId, action, rationale, requestedById: userId, objectId, objectType },
  });
}

export async function reviewApproval(workspaceId: string, reviewerId: string, approvalId: string, approve: boolean, note?: string) {
  const approval = await prisma.chatApproval.findFirst({ where: { id: approvalId, workspaceId, status: "PENDING" } });
  if (!approval) throw new Error("Approval request not found or already reviewed");
  await assertGovernanceRole(workspaceId, reviewerId, ACTION_ROLES[approval.action]);
  return prisma.chatApproval.update({
    where: { id: approvalId },
    data: {
      status: approve ? "APPROVED" : "REJECTED",
      reviewedById: reviewerId,
      reviewedAt: new Date(),
      reviewNote: note,
    },
  });
}

export async function privilegedBypass(workspaceId: string, userId: string) {
  const role = await govRoleOf(workspaceId, userId);
  return role === "SECURITY_ADMIN" || role === "LEGAL_ADMIN";
}

// ── Compliance snapshot (spec data model shape) ─────────────────────────

export async function complianceSnapshot(rec: {
  objectId: string;
  classification: string;
  retentionMode: string;
  retainUntil: Date | null;
  legalHold: boolean;
  encAlgorithm: string;
  keySource: string;
  keyVersion: string | null;
  watermarkEnabled: boolean;
  watermarkStyle: string;
  watermarkViewerScope: string;
  contentHash: string | null;
  chainPrev: string | null;
}) {
  return {
    object_id: rec.objectId,
    classification: rec.classification,
    retention: {
      mode: rec.retentionMode.toLowerCase(),
      retain_until: rec.retainUntil?.toISOString() ?? null,
      legal_hold: rec.legalHold,
    },
    encryption: {
      algorithm: rec.encAlgorithm,
      key_source: rec.keySource,
      key_version: rec.keyVersion ?? null,
    },
    watermark: {
      enabled: rec.watermarkEnabled,
      style: rec.watermarkStyle.toLowerCase(),
      viewer_scope: rec.watermarkViewerScope,
    },
    audit: {
      hash: rec.contentHash ?? null,
      chain_prev: rec.chainPrev ?? null,
    },
  };
}

export function verifyReceipt(contentHash: string, payload: string): boolean {
  const expected = sha3(payload);
  return timingSafeEqual(Buffer.from(contentHash, "hex"), Buffer.from(expected, "hex"));
}
