import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "cloud-storage";

export const STORAGE_ROOT =
  process.env.N0VA_STORAGE_ROOT ?? path.join(process.cwd(), ".data", "storage");

export function storageDirFor(workspaceId: string) {
  const dir = path.join(STORAGE_ROOT, workspaceId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── constants ────────────────────────────────────────────────────────────

export const VERSION_STATUS = {
  CURRENT: "CURRENT",
  SUPERSEDED: "SUPERSEDED",
  RECALLED: "RECALLED",
} as const;

export const APPROVAL_STATUS = {
  DRAFT: "DRAFT",
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export const INDEX_STATE = {
  PENDING: "PENDING",
  EXTRACTED: "EXTRACTED",
  OCR_PENDING: "OCR_PENDING",
  FAILED: "FAILED",
} as const;

export const HOLD_SCOPE = {
  WORKSPACE: "WORKSPACE",
  FOLDER: "FOLDER",
  FILE: "FILE",
} as const;

export const RETENTION_MODE = {
  STANDARD: "STANDARD",
  EXTENDED: "EXTENDED",
  COMPLIANCE: "COMPLIANCE",
  IMMUTABLE: "IMMUTABLE",
} as const;

export const LINK_TYPES = {
  THREAD: "THREAD",
  DECISION: "DECISION",
  TASK: "TASK",
  CALENDAR: "CALENDAR",
  APPROVAL: "APPROVAL",
  MESSAGE: "MESSAGE",
} as const;

export const LOG_ACTION = {
  VIEW: "VIEW",
  PREVIEW: "PREVIEW",
  DOWNLOAD: "DOWNLOAD",
  UPLOAD: "UPLOAD",
  VERSIONED: "VERSIONED",
  RESTORE_VERSION: "RESTORE_VERSION",
  RESTORED: "RESTORED",
  TRASHED: "TRASHED",
  PURGED: "PURGED",
  RENAMED: "RENAMED",
  MOVED: "MOVED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  RECALLED: "RECALLED",
  HOLD_PLACED: "HOLD_PLACED",
  HOLD_RELEASED: "HOLD_RELEASED",
  DENIED: "DENIED",
  EXPORT: "EXPORT",
  INDEXED: "INDEXED",
  LOCKED: "LOCKED",
  UNLOCKED: "UNLOCKED",
  CHECK_OUT: "CHECK_OUT",
  CHECK_IN: "CHECK_IN",
  HOLD_NOTICE: "HOLD_NOTICE",
  HOLD_ACK: "HOLD_ACK",
  PERMISSION_CHANGED: "PERMISSION_CHANGED",
  RETENTION_CHANGED: "RETENTION_CHANGED",
  FOLDER_CREATED: "FOLDER_CREATED",
} as const;

export const FILE_INDEX_OBJECT_TYPES = {
  STORAGE_ITEM: "STORAGE_ITEM",
  CHAT_ATTACHMENT: "CHAT_ATTACHMENT",
  MAIL_ATTACHMENT: "MAIL_ATTACHMENT",
  PHOTO: "PHOTO",
} as const;

const TEXT_MIMES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "text/css",
  "text/xml",
  "application/json",
  "application/xml",
  "application/xhtml+xml",
  "application/javascript",
  "application/typescript",
  "application/sql",
  "application/yaml",
  "application/toml",
  "application/x-yaml",
  "application/rtf",
]);

const STOPWORDS = new Set(
  "a an and are as at be but by for from has have if in into is it its of on or that the their there they this to was were will with you your our we not no yes so what which when where who whom why how all any each more most other some such only own same than too very can just should would could may might must shall do does did done being been about above after before below under over".split(
    " ",
  ),
);

// ── hashing (mirrors chat compliance: sha3-512 canonical chains) ─────────

export function sha3(input: string): string {
  return crypto.createHash("sha3-512").update(input, "utf8").digest("hex");
}

function hashCanonical(parts: Array<string | number | null | undefined>): string {
  return sha3(parts.map((p) => p ?? "").join("|"));
}

/**
 * Deterministic JSON serialization (recursively sorted keys). The JSONB
 * column type reorders object keys on store, so hashing raw stringify output
 * would break chain verification; used on both write and verify paths.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(",")}}`;
}

function embeddingFor(text: string): number[] {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  hash = Math.abs(hash);
  const emb: number[] = [];
  for (let i = 0; i < 8; i++) emb.push(((hash >> (i * 4)) & 0xff) / 255);
  return emb;
}

// ── extraction helpers ───────────────────────────────────────────────────

function isTextMime(mime: string): boolean {
  if (mime.startsWith("text/")) return true;
  return TEXT_MIMES.has(mime.toLowerCase());
}

function isOcrCandidate(mime: string): boolean {
  return mime.startsWith("image/") || mime === "application/pdf";
}

const EMAIL_RE = /[\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,}/g;
const URL_RE = /https?:\/\/[^\s<>"']+/g;
const MENTION_RE = /@[\w.-]+/g;
const TAG_RE = /#[\w-]+/g;
const AMOUNT_RE = /\$\s?\d[\d,]*\.?\d*/g;
const DATE_RE = /\b\d{4}-\d{2}-\d{2}\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/gi;

export function extractEntities(text: string): string[] {
  const out: string[] = [];
  for (const re of [EMAIL_RE, URL_RE, MENTION_RE, TAG_RE, AMOUNT_RE, DATE_RE]) {
    const m = text.match(re);
    if (m) out.push(...m);
  }
  return [...new Set(out)].slice(0, 40);
}

export function extractTopics(text: string, limit = 8): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

const MAX_EXTRACT_BYTES = 5 * 1024 * 1024;
const MAX_EXTRACT_CHARS = 200_000;

// ── service ──────────────────────────────────────────────────────────────

export class StorageService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for cloud-storage`);
    }
  }

  /** Governance override: workspace OWNER/ADMIN or compliance governance role. */
  private async privileged(): Promise<boolean> {
    if (this.role === "OWNER" || this.role === "ADMIN") return true;
    return this.governance();
  }

  /** Compliance governance role only (SECURITY_ADMIN / LEGAL_ADMIN / COMPLIANCE_OFFICER). */
  private async governance(): Promise<boolean> {
    const g = await prisma.chatGovernanceAssignment.findFirst({
      where: {
        workspaceId: this.workspaceId,
        userId: this.userId,
        role: { in: ["SECURITY_ADMIN", "LEGAL_ADMIN", "COMPLIANCE_OFFICER"] },
      },
    });
    return !!g;
  }

  // ── audit ──────────────────────────────────────────────────────────────

  private audit(action: string, targetId: string, metadata?: Record<string, unknown>) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "StorageItem",
      targetId,
      metadata,
    });
  }

  /** Tamper-evident file access log (sha3-512 hash chain, per workspace). */
  private async logAccess(entry: {
    action: string;
    objectType: string;
    objectId: string;
    itemId?: string | null;
    versionId?: string | null;
    versionNumber?: number | null;
    channelId?: string | null;
    module?: string | null;
    outcome?: "SUCCESS" | "DENIED" | "FAILED";
    policyApplied?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    details?: Record<string, unknown>;
  }): Promise<void> {
    const last = await prisma.fileAccessLog.findFirst({
      where: { workspaceId: this.workspaceId },
      orderBy: { chainIndex: "desc" },
      select: { hash: true, chainIndex: true },
    });
    const chainPrev = last?.hash ?? null;
    const chainIndex = (last?.chainIndex ?? 0) + 1;
    const details = canonicalJson(entry.details ?? {});
    const ts = new Date().toISOString();
    const canonical = [
      this.workspaceId,
      this.userId,
      entry.action,
      entry.objectType,
      entry.objectId,
      entry.versionId ?? "",
      entry.versionNumber ?? "",
      entry.channelId ?? "",
      entry.module ?? MODULE,
      entry.outcome ?? "SUCCESS",
      entry.policyApplied ?? "",
      entry.ip ?? "",
      entry.userAgent ?? "",
      details,
      ts,
    ];
    const hash = hashCanonical([...canonical, chainIndex, chainPrev ?? ""]);
    let actorName: string | null = null;
    if (this.userId) {
      const u = await prisma.user.findUnique({ where: { id: this.userId }, select: { name: true, email: true } });
      actorName = u?.name ?? u?.email ?? null;
    }
    await prisma.fileAccessLog.create({
      data: {
        workspaceId: this.workspaceId,
        actorId: this.userId,
        actorName,
        action: entry.action,
        objectType: entry.objectType,
        objectId: entry.objectId,
        itemId: entry.itemId ?? null,
        versionId: entry.versionId ?? null,
        versionNumber: entry.versionNumber ?? null,
        channelId: entry.channelId ?? null,
        module: entry.module ?? MODULE,
        outcome: entry.outcome ?? "SUCCESS",
        policyApplied: entry.policyApplied ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        details: (entry.details ?? {}) as object,
        hash,
        chainPrev,
        chainIndex,
        createdAt: new Date(ts),
      },
    });
  }

  async verifyAuditChain(): Promise<{
    valid: boolean;
    entries: number;
    broken: Array<{ chainIndex: number; expectedHash: string; actualHash: string }>;
  }> {
    const logs = await prisma.fileAccessLog.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { chainIndex: "asc" },
    });
    const broken: Array<{ chainIndex: number; expectedHash: string; actualHash: string }> = [];
    let prev: string | null = null;
    for (const log of logs) {
      const details = canonicalJson(log.details ?? {});
      const canonical = [
        log.workspaceId,
        log.actorId ?? "",
        log.action,
        log.objectType,
        log.objectId,
        log.versionId ?? "",
        log.versionNumber ?? "",
        log.channelId ?? "",
        log.module ?? "",
        log.outcome ?? "SUCCESS",
        log.policyApplied ?? "",
        log.ip ?? "",
        log.userAgent ?? "",
        details,
        log.createdAt.toISOString(),
      ];
      const expected = hashCanonical([...canonical, log.chainIndex, log.chainPrev ?? ""]);
      if (expected !== log.hash || prev !== log.chainPrev) {
        broken.push({ chainIndex: log.chainIndex, expectedHash: expected, actualHash: log.hash });
      }
      prev = log.hash;
    }
    return { valid: broken.length === 0, entries: logs.length, broken };
  }

  // ── extraction & indexing ──────────────────────────────────────────────

  private async readBlobText(storageKey: string, mime: string): Promise<{ text: string | null; ocr: boolean }> {
    if (!isTextMime(mime)) {
      return { text: null, ocr: isOcrCandidate(mime) };
    }
    const disk = path.join(storageDirFor(this.workspaceId), storageKey);
    try {
      const stat = fs.statSync(disk);
      if (stat.size > MAX_EXTRACT_BYTES) return { text: null, ocr: false };
      const raw = fs.readFileSync(disk, "utf8");
      const text = raw.replace(/\r\n/g, "\n").slice(0, MAX_EXTRACT_CHARS);
      return { text, ocr: false };
    } catch {
      return { text: null, ocr: false };
    }
  }

  /**
   * Pluggable OCR adapter. Returns extracted text for image/PDF blobs, or
   * null when no OCR backend is configured (index remains OCR_PENDING).
   * Set N0VA_OCR_COMMAND to a binary that reads the blob path (arg) and
   * writes extracted text to stdout to enable real OCR.
   */
  async ocrFor(_storageKey: string, _mime: string): Promise<string | null> {
    const cmd = process.env.N0VA_OCR_COMMAND;
    if (!cmd) return null;
    try {
      const { execFileSync } = await import("node:child_process");
      return execFileSync(cmd, [_storageKey], { encoding: "utf8", maxBuffer: 5 * 1024 * 1024, timeout: 30_000 });
    } catch {
      return null;
    }
  }

  private async indexFile(item: {
    id: string;
    name: string;
    mimeType: string;
    storageKey: string | null;
    version: number;
  }): Promise<void> {
    if (!item.storageKey) return;
    let text: string | null = null;
    let ocrText: string | null = null;
    let state: string = INDEX_STATE.PENDING;
    const { text: extracted, ocr } = await this.readBlobText(item.storageKey, item.mimeType);
    if (extracted) {
      text = extracted;
      state = INDEX_STATE.EXTRACTED;
    } else if (ocr) {
      ocrText = await this.ocrFor(item.storageKey, item.mimeType);
      state = ocrText ? INDEX_STATE.EXTRACTED : INDEX_STATE.OCR_PENDING;
    } else {
      state = INDEX_STATE.PENDING;
    }
    const combined = [text, ocrText].filter(Boolean).join("\n");
    await prisma.fileIndex.upsert({
      where: {
        workspaceId_objectType_objectId: {
          workspaceId: this.workspaceId,
          objectType: FILE_INDEX_OBJECT_TYPES.STORAGE_ITEM,
          objectId: item.id,
        },
      },
      create: {
        workspaceId: this.workspaceId,
        objectType: FILE_INDEX_OBJECT_TYPES.STORAGE_ITEM,
        objectId: item.id,
        itemId: item.id,
        versionNumber: item.version,
        filename: item.name,
        mimeType: item.mimeType,
        extractedText: text,
        ocrText,
        entities: extractEntities(combined) as object,
        topics: extractTopics(combined) as object,
        indexState: state,
        indexedAt: new Date(),
      },
      update: {
        itemId: item.id,
        versionNumber: item.version,
        filename: item.name,
        mimeType: item.mimeType,
        extractedText: text,
        ocrText,
        entities: extractEntities(combined) as object,
        topics: extractTopics(combined) as object,
        indexState: state,
        indexedAt: new Date(),
      },
    });
    // Cross-module search index (same vector space as SearchEngine).
    await prisma.searchIndex.upsert({
      where: {
        workspaceId_contentType_contentId: {
          workspaceId: this.workspaceId,
          contentType: "STORAGE_ITEM",
          contentId: item.id,
        },
      },
      create: {
        workspaceId: this.workspaceId,
        contentType: "STORAGE_ITEM",
        contentId: item.id,
        title: item.name,
        body: combined || item.name,
        excerpt: combined.slice(0, 200) || item.name,
        embedding: JSON.stringify(embeddingFor(item.name + " " + combined)),
        lexicalVector: (combined || item.name).toLowerCase(),
        entities: extractEntities(combined) as object,
        metadata: {
          mimeType: item.mimeType,
          versionNumber: item.version,
          module: MODULE,
        },
        permissions: { workspaceId: this.workspaceId, scope: "WORKSPACE" },
      },
      update: {
        title: item.name,
        body: combined || item.name,
        excerpt: combined.slice(0, 200) || item.name,
        embedding: JSON.stringify(embeddingFor(item.name + " " + combined)),
        lexicalVector: (combined || item.name).toLowerCase(),
        entities: extractEntities(combined) as object,
        metadata: {
          mimeType: item.mimeType,
          versionNumber: item.version,
          module: MODULE,
        },
      },
    });
    await this.logAccess({
      action: LOG_ACTION.INDEXED,
      objectType: "StorageItem",
      objectId: item.id,
      itemId: item.id,
      versionNumber: item.version,
      details: { state, bytes: combined.length, ocr: !!ocrText },
    });
  }

  /** Re-run extraction/indexing for a file (index freshness repair). */
  async reindex(itemId: string): Promise<{ state: string }> {
    await this.assert("UPDATE");
    const item = await this.owned(itemId);
    if (item.isFolder) throw new Error("Folders have no content index");
    await this.indexFile(item);
    return { state: (await prisma.fileIndex.findUnique({
      where: {
        workspaceId_objectType_objectId: {
          workspaceId: this.workspaceId,
          objectType: FILE_INDEX_OBJECT_TYPES.STORAGE_ITEM,
          objectId: itemId,
        },
      },
      select: { indexState: true },
    }))?.indexState ?? INDEX_STATE.PENDING };
  }

  async indexFor(itemId: string) {
    await this.assert("READ");
    return prisma.fileIndex.findUnique({
      where: {
        workspaceId_objectType_objectId: {
          workspaceId: this.workspaceId,
          objectType: FILE_INDEX_OBJECT_TYPES.STORAGE_ITEM,
          objectId: itemId,
        },
      },
    });
  }

  // ── protection & retention ─────────────────────────────────────────────

  private isProtected(item: { legalHold: boolean; complianceLocked: boolean; immutable: boolean }): boolean {
    return item.legalHold || item.complianceLocked || item.immutable;
  }

  /**
   * Mutation guard. Compliance lock can be overridden only by a compliance
   * governance role (audited override); legal hold and immutable (WORM) are
   * absolute — releaseLegalHold is the only way out of a hold.
   */
  private async assertMutable(item: { id: string; legalHold: boolean; complianceLocked: boolean; immutable: boolean }, complianceOverride = false) {
    if (item.immutable) {
      await this.logAccess({
        action: LOG_ACTION.DENIED,
        objectType: "StorageItem",
        objectId: item.id,
        itemId: item.id,
        policyApplied: "IMMUTABLE",
        details: { reason: "Immutable (WORM) item mutation denied", blocked: "mutation" },
      });
      throw new Error("Item is under immutable retention (WORM) and cannot be modified or deleted");
    }
    if (item.legalHold) {
      await this.logAccess({
        action: LOG_ACTION.DENIED,
        objectType: "StorageItem",
        objectId: item.id,
        itemId: item.id,
        policyApplied: "LEGAL_HOLD",
        details: { reason: "Held item mutation denied", blocked: "mutation" },
      });
      throw new Error("Item is under legal hold and cannot be modified or deleted");
    }
    if (item.complianceLocked && !complianceOverride) {
      await this.logAccess({
        action: LOG_ACTION.DENIED,
        objectType: "StorageItem",
        objectId: item.id,
        itemId: item.id,
        policyApplied: "COMPLIANCE_LOCK",
        details: { reason: "Compliance-locked item mutation denied", blocked: "mutation" },
      });
      throw new Error("Item is under compliance lock and cannot be modified or deleted");
    }
  }

  async setRetention(input: { itemId: string; mode: string; retainUntil?: string | null }) {
    await this.assert("UPDATE");
    const item = await this.owned(input.itemId);
    const bypass = await this.privileged();
    if (input.mode === RETENTION_MODE.IMMUTABLE || input.mode === RETENTION_MODE.COMPLIANCE) {
      if (!bypass) throw new Error("Only workspace owners/admins or compliance roles can apply compliance retention");
    }
    const updated = await prisma.storageItem.update({
      where: { id: item.id },
      data: {
        retentionMode: input.mode,
        retainUntil: input.retainUntil ? new Date(input.retainUntil) : null,
        complianceLocked: input.mode === RETENTION_MODE.COMPLIANCE || input.mode === RETENTION_MODE.IMMUTABLE ? true : item.complianceLocked,
        immutable: input.mode === RETENTION_MODE.IMMUTABLE,
      },
    });
    await this.audit("storage.item.retention_set", item.id, { mode: input.mode });
    await this.logAccess({
      action: "RETENTION_CHANGED",
      objectType: "StorageItem",
      objectId: item.id,
      itemId: item.id,
      policyApplied: input.mode,
      details: { mode: input.mode, retainUntil: updated.retainUntil?.toISOString() ?? null },
    });
    return updated;
  }

  // ── CRUD ───────────────────────────────────────────────────────────────

  async list(parentId: string | null) {
    await this.assert("READ");
    return prisma.storageItem.findMany({
      where: { workspaceId: this.workspaceId, parentId: parentId ?? null, trashedAt: null },
      orderBy: [{ isFolder: "desc" }, { name: "asc" }],
    });
  }

  async breadcrumbs(parentId: string | null) {
    await this.assert("READ");
    const crumbs: Array<{ id: string; name: string }> = [];
    let current = parentId ? await this.owned(parentId) : null;
    while (current) {
      crumbs.unshift({ id: current.id, name: current.name });
      current = current.parentId ? await this.owned(current.parentId) : null;
    }
    return crumbs;
  }

  async createFolder(name: string, parentId: string | null) {
    await this.assert("CREATE");
    const item = await prisma.storageItem.create({
      data: { workspaceId: this.workspaceId, createdById: this.userId, name, isFolder: true, parentId: parentId ?? null },
    });
    await this.audit("storage.folder.created", item.id);
    await this.logAccess({
      action: "FOLDER_CREATED",
      objectType: "StorageItem",
      objectId: item.id,
      itemId: item.id,
      module: MODULE,
    });
    return item;
  }

  async recordUpload(input: {
    name: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
    checksum: string;
    parentId: string | null;
    changeSummary?: string | null;
  }) {
    await this.assert("CREATE");
    const item = await prisma.storageItem.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        name: input.name,
        isFolder: false,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        storageKey: input.storageKey,
        checksum: input.checksum,
        parentId: input.parentId ?? null,
      },
    });
    await prisma.storageFileVersion.create({
      data: {
        itemId: item.id,
        workspaceId: this.workspaceId,
        versionNumber: 1,
        status: VERSION_STATUS.CURRENT,
        changeSummary: input.changeSummary ?? null,
        sizeBytes: input.sizeBytes,
        storageKey: input.storageKey,
        checksum: input.checksum,
        createdById: this.userId,
      },
    });
    await this.indexFile(item);
    await this.audit("storage.file.uploaded", item.id, { sizeBytes: input.sizeBytes });
    await this.logAccess({
      action: LOG_ACTION.UPLOAD,
      objectType: "StorageItem",
      objectId: item.id,
      itemId: item.id,
      versionNumber: 1,
      details: { sizeBytes: input.sizeBytes, mimeType: input.mimeType, checksum: input.checksum },
    });
    return item;
  }

  async uploadNewVersion(input: {
    itemId: string;
    sizeBytes: number;
    storageKey: string;
    checksum: string;
    changeSummary?: string | null;
  }) {
    await this.assert("UPDATE");
    const item = await this.owned(input.itemId);
    if (item.isFolder || !item.storageKey) throw new Error("Not a file");
    await this.assertMutable(item);
    if (item.lockedById && item.lockedById !== this.userId && !(await this.privileged())) {
      await this.logAccess({
        action: LOG_ACTION.DENIED,
        objectType: "StorageItem",
        objectId: item.id,
        itemId: item.id,
        policyApplied: "CHECKED_OUT",
        details: { reason: "File is checked out; only the locker may create versions", lockedById: item.lockedById },
      });
      throw new Error("File is checked out by another user");
    }
    const current = await prisma.storageFileVersion.findFirst({
      where: { itemId: item.id, versionNumber: item.version },
    });
    await prisma.storageFileVersion.create({
      data: {
        itemId: item.id,
        workspaceId: this.workspaceId,
        versionNumber: item.version + 1,
        status: VERSION_STATUS.CURRENT,
        changeSummary: input.changeSummary ?? null,
        sizeBytes: input.sizeBytes,
        storageKey: input.storageKey,
        checksum: input.checksum,
        createdById: this.userId,
        isLocked: this.isProtected(item),
      },
    });
    if (current) {
      await prisma.storageFileVersion.update({
        where: { id: current.id },
        data: { status: VERSION_STATUS.SUPERSEDED },
      });
    }
    const updated = await prisma.storageItem.update({
      where: { id: item.id },
      data: { version: { increment: 1 }, sizeBytes: input.sizeBytes, storageKey: input.storageKey, checksum: input.checksum },
    });
    await this.indexFile(updated);
    await this.audit("storage.file.versioned", item.id, { version: updated.version, sizeBytes: input.sizeBytes });
    await this.logAccess({
      action: LOG_ACTION.VERSIONED,
      objectType: "StorageItem",
      objectId: item.id,
      itemId: item.id,
      versionNumber: updated.version,
      details: { sizeBytes: input.sizeBytes, checksum: input.checksum },
    });
    return updated;
  }

  async rename(id: string, name: string) {
    await this.assert("UPDATE");
    const item = await this.owned(id);
    await this.assertMutable(item);
    const updated = await prisma.storageItem.update({ where: { id }, data: { name } });
    await this.audit("storage.item.renamed", id, { name });
    await this.logAccess({ action: LOG_ACTION.RENAMED, objectType: "StorageItem", objectId: id, itemId: id });
    return updated;
  }

  async move(id: string, parentId: string | null) {
    await this.assert("UPDATE");
    const item = await this.owned(id);
    await this.assertMutable(item);
    if (parentId) await this.owned(parentId);
    const updated = await prisma.storageItem.update({ where: { id }, data: { parentId: parentId ?? null } });
    await this.audit("storage.item.moved", id, { parentId });
    await this.logAccess({ action: LOG_ACTION.MOVED, objectType: "StorageItem", objectId: id, itemId: id, details: { parentId } });
    return updated;
  }

  async trash(id: string) {
    await this.assert("DELETE");
    const item = await this.owned(id);
    await this.assertMutable(item);
    const updated = await prisma.storageItem.update({ where: { id }, data: { trashedAt: new Date() } });
    await this.audit("storage.item.trashed", id);
    await this.logAccess({ action: LOG_ACTION.TRASHED, objectType: "StorageItem", objectId: id, itemId: id });
    return updated;
  }

  async restore(id: string) {
    await this.assert("UPDATE");
    await this.owned(id);
    const updated = await prisma.storageItem.update({ where: { id }, data: { trashedAt: null } });
    await this.audit("storage.item.restored", id);
    await this.logAccess({ action: LOG_ACTION.RESTORED, objectType: "StorageItem", objectId: id, itemId: id });
    return updated;
  }

  async listTrash() {
    await this.assert("READ");
    return prisma.storageItem.findMany({
      where: { workspaceId: this.workspaceId, trashedAt: { not: null } },
      orderBy: { trashedAt: "desc" },
      take: 200,
    });
  }

  async purge(id: string) {
    await this.assert("DELETE");
    const item = await this.owned(id);
    const complianceOverride = await this.governance();
    await this.assertMutable(item, complianceOverride);
    const versionCount = await prisma.storageFileVersion.count({ where: { itemId: id } });
    const deletionProof = {
      checksum: item.checksum,
      sizeBytes: item.sizeBytes,
      versionCount,
      purgedById: this.userId,
      policyApplied: item.complianceLocked && complianceOverride ? "COMPLIANCE_LOCK_BYPASS" : null,
    };
    if (item.storageKey) {
      const disk = path.join(storageDirFor(this.workspaceId), item.storageKey);
      try {
        fs.rmSync(disk, { force: true });
      } catch {
        // best-effort cleanup
      }
    }
    await prisma.storageItem.delete({ where: { id } });
    await this.audit("storage.item.purged", id, deletionProof);
    await this.logAccess({
      action: LOG_ACTION.PURGED,
      objectType: "StorageItem",
      objectId: id,
      itemId: id,
      policyApplied: deletionProof.policyApplied ?? null,
      details: deletionProof,
    });
    return deletionProof;
  }

  async getForDownload(id: string, meta?: { ip?: string; userAgent?: string }) {
    await this.assert("READ");
    const item = await this.owned(id);
    if (item.restrictedDownload && !(await this.privileged())) {
      await this.logAccess({
        action: LOG_ACTION.DENIED,
        objectType: "StorageItem",
        objectId: id,
        itemId: id,
        versionNumber: item.version,
        policyApplied: "RESTRICTED_DOWNLOAD",
        ip: meta?.ip ?? null,
        userAgent: meta?.userAgent ?? null,
        details: { reason: "Download restricted; preview only", blocked: "download" },
      });
      throw new Error("Download is restricted for this file (preview only)");
    }
    const touched = await this.touchAccess(id);
    await this.logAccess({
      action: LOG_ACTION.DOWNLOAD,
      objectType: "StorageItem",
      objectId: id,
      itemId: id,
      versionNumber: touched.version,
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
    });
    return touched;
  }

  /** Preview access — logged separately from download (access log completeness). */
  async getForPreview(id: string, meta?: { ip?: string; userAgent?: string }) {
    await this.assert("READ");
    await this.owned(id);
    const item = await this.touchAccess(id);
    await this.logAccess({
      action: LOG_ACTION.PREVIEW,
      objectType: "StorageItem",
      objectId: id,
      itemId: id,
      versionNumber: item.version,
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
    });
    return item;
  }

  private async touchAccess(id: string) {
    return prisma.storageItem.update({
      where: { id },
      data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
    });
  }

  async versions(itemId: string) {
    await this.assert("READ");
    await this.owned(itemId);
    return prisma.storageFileVersion.findMany({
      where: { itemId },
      orderBy: { versionNumber: "desc" },
    });
  }

  // ── version lifecycle ──────────────────────────────────────────────────

  /** Restore a past version as a new CURRENT revision (immutable history preserved). */
  async restoreVersion(itemId: string, versionNumber: number, changeSummary?: string | null) {
    await this.assert("UPDATE");
    const item = await this.owned(itemId);
    if (item.isFolder) throw new Error("Folders have no versions");
    await this.assertMutable(item);
    if (item.lockedById && item.lockedById !== this.userId && !(await this.privileged())) {
      await this.logAccess({
        action: LOG_ACTION.DENIED,
        objectType: "StorageItem",
        objectId: itemId,
        itemId,
        policyApplied: "CHECKED_OUT",
        details: { reason: "File is checked out; only the locker may restore versions", lockedById: item.lockedById },
      });
      throw new Error("File is checked out by another user");
    }
    const target = await prisma.storageFileVersion.findFirst({ where: { itemId, versionNumber } });
    if (!target) throw new Error("Version not found");
    const current = await prisma.storageFileVersion.findFirst({ where: { itemId, versionNumber: item.version } });
    const newVersion = await prisma.storageFileVersion.create({
      data: {
        itemId,
        workspaceId: this.workspaceId,
        versionNumber: item.version + 1,
        status: VERSION_STATUS.CURRENT,
        changeSummary: changeSummary ?? `Restored from v${versionNumber}`,
        sizeBytes: target.sizeBytes,
        storageKey: target.storageKey,
        checksum: target.checksum,
        createdById: this.userId,
        isLocked: this.isProtected(item),
      },
    });
    if (current) {
      await prisma.storageFileVersion.update({ where: { id: current.id }, data: { status: VERSION_STATUS.SUPERSEDED } });
    }
    const updated = await prisma.storageItem.update({
      where: { id: itemId },
      data: { version: { increment: 1 }, sizeBytes: target.sizeBytes, storageKey: target.storageKey, checksum: target.checksum },
    });
    await this.indexFile(updated);
    await this.audit("storage.file.restored_version", itemId, { from: versionNumber, to: updated.version });
    await this.logAccess({
      action: LOG_ACTION.RESTORE_VERSION,
      objectType: "StorageItem",
      objectId: itemId,
      itemId,
      versionId: newVersion.id,
      versionNumber: newVersion.versionNumber,
      details: { restoredFrom: versionNumber },
    });
    return updated;
  }

  /** Recall a version from circulation (governance action). */
  async recallVersion(itemId: string, versionNumber: number, reason: string) {
    await this.assert("UPDATE");
    const item = await this.owned(itemId);
    const bypass = await this.privileged();
    if (!bypass) throw new Error("Only workspace owners/admins or compliance roles can recall versions");
    const target = await prisma.storageFileVersion.findFirst({ where: { itemId, versionNumber } });
    if (!target) throw new Error("Version not found");
    const updated = await prisma.storageFileVersion.update({
      where: { id: target.id },
      data: { status: VERSION_STATUS.RECALLED, recalledById: this.userId, recalledAt: new Date(), recallReason: reason },
    });
    await this.audit("storage.file.recalled", itemId, { version: versionNumber, reason });
    await this.logAccess({
      action: LOG_ACTION.RECALLED,
      objectType: "StorageItem",
      objectId: itemId,
      itemId,
      versionId: target.id,
      versionNumber,
      details: { reason },
    });
    return updated;
  }

  async setApproval(input: { itemId: string; versionNumber: number; approval: string; note?: string }) {
    await this.assert("UPDATE");
    const item = await this.owned(input.itemId);
    if (input.approval !== APPROVAL_STATUS.APPROVED && input.approval !== APPROVAL_STATUS.REJECTED) {
      throw new Error("Only APPROVED or REJECTED");
    }
    const target = await prisma.storageFileVersion.findFirst({ where: { itemId: input.itemId, versionNumber: input.versionNumber } });
    if (!target) throw new Error("Version not found");
    await prisma.storageFileVersion.update({
      where: { id: target.id },
      data: {
        approvalStatus: input.approval,
        approvedById: this.userId,
        approvedAt: new Date(),
        changeSummary: input.note ? [target.changeSummary, `Approval: ${input.approval} — ${input.note}`].filter(Boolean).join(" · ") : target.changeSummary,
      },
    });
    await this.audit("storage.file.approval", input.itemId, { version: input.versionNumber, approval: input.approval });
    await this.logAccess({
      action: input.approval === APPROVAL_STATUS.APPROVED ? LOG_ACTION.APPROVED : LOG_ACTION.REJECTED,
      objectType: "StorageItem",
      objectId: input.itemId,
      itemId: input.itemId,
      versionId: target.id,
      versionNumber: input.versionNumber,
      details: { note: input.note ?? null },
    });
  }

  async setVersionLock(input: { itemId: string; versionNumber: number; locked: boolean }) {
    await this.assert("UPDATE");
    await this.owned(input.itemId);
    const target = await prisma.storageFileVersion.findFirst({ where: { itemId: input.itemId, versionNumber: input.versionNumber } });
    if (!target) throw new Error("Version not found");
    await prisma.storageFileVersion.update({ where: { id: target.id }, data: { isLocked: input.locked } });
    await this.logAccess({
      action: input.locked ? LOG_ACTION.LOCKED : LOG_ACTION.UNLOCKED,
      objectType: "StorageItem",
      objectId: input.itemId,
      itemId: input.itemId,
      versionId: target.id,
      versionNumber: input.versionNumber,
    });
  }

  // ── collaboration controls (check-in / check-out) ───────────────────────

  /** Check out a file for exclusive editing. Held/immutable items cannot be checked out. */
  async checkOut(itemId: string) {
    await this.assert("UPDATE");
    const item = await this.owned(itemId);
    if (item.isFolder || !item.storageKey) throw new Error("Not a file");
    await this.assertMutable(item);
    if (item.lockedById && item.lockedById !== this.userId) {
      await this.logAccess({
        action: LOG_ACTION.DENIED,
        objectType: "StorageItem",
        objectId: itemId,
        itemId,
        policyApplied: "CHECKED_OUT",
        details: { reason: "Checked out by another user", lockedById: item.lockedById },
      });
      throw new Error("File is checked out by another user");
    }
    const updated = await prisma.storageItem.update({
      where: { id: itemId },
      data: { lockedById: this.userId, lockedAt: new Date() },
    });
    await this.audit("storage.file.checked_out", itemId, { lockedById: this.userId });
    await this.logAccess({
      action: LOG_ACTION.CHECK_OUT,
      objectType: "StorageItem",
      objectId: itemId,
      itemId,
      versionNumber: updated.version,
    });
    return updated;
  }

  /** Check in a file. The locker releases it; privileged users can force release. */
  async checkIn(itemId: string) {
    await this.assert("UPDATE");
    const item = await this.owned(itemId);
    if (!item.lockedById) return item;
    if (item.lockedById !== this.userId && !(await this.privileged())) {
      await this.logAccess({
        action: LOG_ACTION.DENIED,
        objectType: "StorageItem",
        objectId: itemId,
        itemId,
        policyApplied: "CHECKED_OUT",
        details: { reason: "Only the locker (or privileged user) can check in", lockedById: item.lockedById },
      });
      throw new Error("Only the locker can check in this file");
    }
    const updated = await prisma.storageItem.update({
      where: { id: itemId },
      data: { lockedById: null, lockedAt: null },
    });
    await this.audit("storage.file.checked_in", itemId, { releasedById: this.userId });
    await this.logAccess({
      action: LOG_ACTION.CHECK_IN,
      objectType: "StorageItem",
      objectId: itemId,
      itemId,
      versionNumber: updated.version,
      details: item.lockedById !== this.userId ? { forced: true, priorLocker: item.lockedById } : undefined,
    });
    return updated;
  }

  /** Restrict or allow downloads for sensitive files (privileged). */
  async setRestrictedDownload(itemId: string, restricted: boolean) {
    await this.assert("UPDATE");
    const item = await this.owned(itemId);
    if (!(await this.privileged())) throw new Error("Only privileged users can change download policy");
    await this.assertMutable(item);
    const updated = await prisma.storageItem.update({
      where: { id: itemId },
      data: { restrictedDownload: restricted },
    });
    await this.audit("storage.file.permission_changed", itemId, { restrictedDownload: restricted });
    await this.logAccess({
      action: LOG_ACTION.PERMISSION_CHANGED,
      objectType: "StorageItem",
      objectId: itemId,
      itemId,
      policyApplied: restricted ? "RESTRICTED_DOWNLOAD" : null,
      details: { restrictedDownload: restricted },
    });
    return updated;
  }

  /** Export the tamper-evident access log as CSV (SIEM/archive handoff). */
  async exportAccessLogsCsv(opts: { itemId?: string; action?: string; from?: string; to?: string } = {}): Promise<string> {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (opts.itemId) where.itemId = opts.itemId;
    if (opts.action) where.action = opts.action;
    if (opts.from || opts.to) {
      where.createdAt = {};
      if (opts.from) (where.createdAt as Record<string, unknown>).gte = new Date(opts.from);
      if (opts.to) (where.createdAt as Record<string, unknown>).lte = new Date(opts.to);
    }
    const rows = await prisma.fileAccessLog.findMany({ where, orderBy: { chainIndex: "asc" } });
    const header = ["chainIndex", "timestamp", "actorId", "actorName", "action", "objectType", "objectId", "itemId", "versionNumber", "channelId", "module", "outcome", "policyApplied", "ip", "userAgent", "chainPrev", "hash"];
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [header.join(",")].concat(
      rows.map((r) => [r.chainIndex, r.createdAt.toISOString(), r.actorId, r.actorName, r.action, r.objectType, r.objectId, r.itemId, r.versionNumber, r.channelId, r.module, r.outcome, r.policyApplied, r.ip, r.userAgent, r.chainPrev, r.hash].map(esc).join(",")),
    );
    await this.logAccess({
      action: LOG_ACTION.EXPORT,
      objectType: "FileAccessLog",
      objectId: "workspace",
      itemId: opts.itemId ?? null,
      details: { rows: rows.length, format: "csv", filters: opts },
    });
    return csv.join("\n");
  }

  // ── operational metrics ─────────────────────────────────────────────────

  /** Storage health/compliance dashboard numbers (indexing, holds, audit). */
  async storageMetrics() {
    await this.assert("READ");
    const [totalItems, totalFolders, indexRows, versionRows, restoreCount, logCount, deniedCount, holdActive, heldItems, complianceLocked, immutable, approvedVersions, trashed, restricted, checkedOut, retentions] = await Promise.all([
      prisma.storageItem.count({ where: { workspaceId: this.workspaceId, isFolder: false } }),
      prisma.storageItem.count({ where: { workspaceId: this.workspaceId, isFolder: true } }),
      prisma.fileIndex.count({ where: { workspaceId: this.workspaceId, objectType: FILE_INDEX_OBJECT_TYPES.STORAGE_ITEM, indexState: { in: ["EXTRACTED", "OCR_PENDING"] } } }),
      prisma.storageFileVersion.count({ where: { workspaceId: this.workspaceId } }),
      prisma.fileAccessLog.count({ where: { workspaceId: this.workspaceId, action: LOG_ACTION.RESTORE_VERSION } }),
      prisma.fileAccessLog.count({ where: { workspaceId: this.workspaceId } }),
      prisma.fileAccessLog.count({ where: { workspaceId: this.workspaceId, action: LOG_ACTION.DENIED } }),
      prisma.fileLegalHold.count({ where: { workspaceId: this.workspaceId, active: true } }),
      prisma.storageItem.count({ where: { workspaceId: this.workspaceId, legalHold: true } }),
      prisma.storageItem.count({ where: { workspaceId: this.workspaceId, complianceLocked: true } }),
      prisma.storageItem.count({ where: { workspaceId: this.workspaceId, immutable: true } }),
      prisma.storageFileVersion.count({ where: { workspaceId: this.workspaceId, approvalStatus: APPROVAL_STATUS.APPROVED } }),
      prisma.storageItem.count({ where: { workspaceId: this.workspaceId, isFolder: false, trashedAt: { not: null } } }),
      prisma.storageItem.count({ where: { workspaceId: this.workspaceId, restrictedDownload: true } }),
      prisma.storageItem.count({ where: { workspaceId: this.workspaceId, lockedById: { not: null } } }),
      prisma.storageItem.groupBy({ by: ["retentionMode"], where: { workspaceId: this.workspaceId }, _count: true }),
    ]);
    const retentionBreakdown = Object.fromEntries(retentions.map((r) => [r.retentionMode, r._count]));
    return {
      items: totalItems,
      folders: totalFolders,
      indexed: indexRows,
      indexCoverage: totalItems === 0 ? 1 : Number((indexRows / totalItems).toFixed(3)),
      versions: versionRows,
      restores: restoreCount,
      accessLogs: logCount,
      deniedAttempts: deniedCount,
      activeHolds: holdActive,
      heldItems: heldItems,
      holdCoverage: totalItems === 0 ? 0 : Number((heldItems / totalItems).toFixed(3)),
      complianceLocked: complianceLocked,
      immutable: immutable,
      approvedVersions: approvedVersions,
      trashed: trashed,
      restrictedDownloads: restricted,
      checkedOut: checkedOut,
      retentionBreakdown,
      chainValid: await this.verifyAuditChain().then((c) => c.valid).catch(() => false),
    };
  }

  // ── legal hold ─────────────────────────────────────────────────────────

  /**
   * Place a legal hold on a file, folder (with descendants) or the whole
   * workspace. Freezes the item and all versions; overrides deletion and
   * retention expiry.
   */
  async placeLegalHold(input: { scope: string; objectId?: string | null; matterName?: string | null; reason: string; ip?: string | null }) {
    await this.assert("UPDATE");
    if (!(await this.privileged())) throw new Error("Only workspace owners/admins or compliance roles can place legal holds");
    const targets: Array<{ id: string; name: string }> = [];
    if (input.scope === HOLD_SCOPE.WORKSPACE) {
      const items = await prisma.storageItem.findMany({ where: { workspaceId: this.workspaceId }, select: { id: true, name: true } });
      targets.push(...items);
    } else if (input.scope === HOLD_SCOPE.FOLDER || input.scope === HOLD_SCOPE.FILE) {
      const seed = await this.owned(input.objectId ?? "");
      targets.push({ id: seed.id, name: seed.name });
      if (input.scope === HOLD_SCOPE.FOLDER) {
        const descendants = await this.descendants(seed.id);
        targets.push(...descendants.map((d) => ({ id: d.id, name: d.name })));
      }
    } else {
      throw new Error("Invalid hold scope");
    }
    const fileTargets = targets.filter((t) => t.id !== null && t.id !== undefined);
    const items = await prisma.storageItem.findMany({ where: { id: { in: fileTargets.map((t) => t.id) } } });
    await prisma.storageItem.updateMany({
      where: { id: { in: items.map((i) => i.id) } },
      data: { legalHold: true, legalHoldReason: input.reason },
    });
    await prisma.storageFileVersion.updateMany({
      where: { itemId: { in: items.map((i) => i.id) } },
      data: { isLocked: true },
    });
    const hold = await prisma.fileLegalHold.create({
      data: {
        workspaceId: this.workspaceId,
        scope: input.scope,
        objectId: input.scope === HOLD_SCOPE.WORKSPACE ? null : input.objectId ?? null,
        matterName: input.matterName ?? null,
        reason: input.reason,
        placedById: this.userId,
      },
    });
    await this.audit("storage.legal_hold.placed", input.objectId ?? this.workspaceId, {
      scope: input.scope,
      matterName: input.matterName ?? null,
      itemsCovered: items.length,
    });
    await this.logAccess({
      action: LOG_ACTION.HOLD_PLACED,
      objectType: "StorageItem",
      objectId: input.objectId ?? this.workspaceId,
      policyApplied: "LEGAL_HOLD",
      ip: input.ip ?? null,
      details: { scope: input.scope, matterName: input.matterName ?? null, holdId: hold.id, itemsCovered: items.length },
    });
    return { hold, itemsCovered: items.length };
  }

  /** Release a hold; item flags are cleared only when no other active hold covers them. */
  async releaseLegalHold(holdId: string, note?: string | null) {
    await this.assert("UPDATE");
    if (!(await this.privileged())) throw new Error("Only workspace owners/admins or compliance roles can release legal holds");
    const hold = await prisma.fileLegalHold.findFirst({ where: { id: holdId, workspaceId: this.workspaceId, active: true } });
    if (!hold) throw new Error("Active legal hold not found");
    await prisma.fileLegalHold.update({
      where: { id: holdId },
      data: { active: false, releasedById: this.userId, releasedAt: new Date() },
    });
    // Refresh protection flags for affected items.
    const covered = await this.itemsCoveredByHolds();
    const coveredIds = new Set(covered.map((c) => c.id));
    await prisma.storageItem.updateMany({
      where: { workspaceId: this.workspaceId, legalHold: true },
      data: { legalHold: false, legalHoldReason: null },
    });
    await prisma.storageItem.updateMany({ where: { id: { in: [...coveredIds] } }, data: { legalHold: true } });
    await this.audit("storage.legal_hold.released", hold.objectId ?? this.workspaceId, { note: note ?? null });
    await this.logAccess({
      action: LOG_ACTION.HOLD_RELEASED,
      objectType: "StorageItem",
      objectId: hold.objectId ?? this.workspaceId,
      policyApplied: "LEGAL_HOLD",
      details: { holdId, note: note ?? null, stillCovered: coveredIds.size },
    });
  }

  /** Record that a formal hold notice was issued to the matter's custodians. */
  async issueHoldNotice(holdId: string) {
    await this.assert("UPDATE");
    if (!(await this.privileged())) throw new Error("Only privileged users can issue hold notices");
    const hold = await prisma.fileLegalHold.findFirst({ where: { id: holdId, workspaceId: this.workspaceId } });
    if (!hold) throw new Error("Legal hold not found");
    const updated = await prisma.fileLegalHold.update({
      where: { id: holdId },
      data: { noticeIssuedAt: new Date() },
    });
    await this.audit("storage.legal_hold.notice_issued", hold.objectId ?? this.workspaceId, { holdId });
    await this.logAccess({
      action: LOG_ACTION.HOLD_NOTICE,
      objectType: "FileLegalHold",
      objectId: holdId,
      itemId: hold.scope === HOLD_SCOPE.FILE ? hold.objectId : null,
      policyApplied: "LEGAL_HOLD",
      details: { scope: hold.scope, matterName: hold.matterName ?? null },
    });
    return updated;
  }

  /** Custodian acknowledgment of a hold notice. */
  async acknowledgeHold(holdId: string) {
    await this.assert("UPDATE");
    const hold = await prisma.fileLegalHold.findFirst({ where: { id: holdId, workspaceId: this.workspaceId } });
    if (!hold) throw new Error("Legal hold not found");
    const updated = await prisma.fileLegalHold.update({
      where: { id: holdId },
      data: { acknowledgedById: this.userId, acknowledgedAt: new Date() },
    });
    await this.audit("storage.legal_hold.acknowledged", hold.objectId ?? this.workspaceId, { holdId, acknowledgedById: this.userId });
    await this.logAccess({
      action: LOG_ACTION.HOLD_ACK,
      objectType: "FileLegalHold",
      objectId: holdId,
      itemId: hold.scope === HOLD_SCOPE.FILE ? hold.objectId : null,
      policyApplied: "LEGAL_HOLD",
      details: { scope: hold.scope },
    });
    return updated;
  }

  private async descendants(folderId: string): Promise<Array<{ id: string; name: string }>> {
    const out: Array<{ id: string; name: string }> = [];
    const queue = [folderId];
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      const kids = await prisma.storageItem.findMany({ where: { workspaceId: this.workspaceId, parentId }, select: { id: true, name: true } });
      for (const k of kids) {
        out.push(k);
        queue.push(k.id);
      }
    }
    return out;
  }

  /** All items covered by at least one active hold (workspace/folder/file scopes). */
  private async itemsCoveredByHolds(): Promise<Array<{ id: string; name: string }>> {
    const holds = await prisma.fileLegalHold.findMany({ where: { workspaceId: this.workspaceId, active: true } });
    const covered = new Map<string, { id: string; name: string }>();
    for (const h of holds) {
      if (h.scope === HOLD_SCOPE.WORKSPACE) {
        const all = await prisma.storageItem.findMany({ where: { workspaceId: this.workspaceId }, select: { id: true, name: true } });
        for (const a of all) covered.set(a.id, a);
      } else if (h.scope === HOLD_SCOPE.FOLDER && h.objectId) {
        const seed = await prisma.storageItem.findFirst({ where: { id: h.objectId, workspaceId: this.workspaceId }, select: { id: true, name: true } });
        if (seed) {
          covered.set(seed.id, seed);
          for (const d of await this.descendants(seed.id)) covered.set(d.id, d);
        }
      } else if (h.scope === HOLD_SCOPE.FILE && h.objectId) {
        const f = await prisma.storageItem.findFirst({ where: { id: h.objectId, workspaceId: this.workspaceId }, select: { id: true, name: true } });
        if (f) covered.set(f.id, f);
      }
    }
    return [...covered.values()];
  }

  async listLegalHolds() {
    await this.assert("READ");
    const holds = await prisma.fileLegalHold.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { placedAt: "desc" },
      take: 100,
    });
    return holds;
  }

  /** Active holds that cover a given item. */
  async holdsFor(itemId: string) {
    await this.assert("READ");
    const item = await this.owned(itemId);
    const holds = await prisma.fileLegalHold.findMany({ where: { workspaceId: this.workspaceId, active: true } });
    const covering = [];
    for (const h of holds) {
      if (h.scope === HOLD_SCOPE.WORKSPACE) covering.push({ ...h, via: "workspace" });
      else if (h.scope === HOLD_SCOPE.FILE && h.objectId === item.id) covering.push({ ...h, via: "file" });
      else if (h.scope === HOLD_SCOPE.FOLDER && h.objectId) {
        let cursor = item.parentId;
        while (cursor) {
          if (cursor === h.objectId) {
            covering.push({ ...h, via: "folder" });
            break;
          }
          const parent = await prisma.storageItem.findFirst({ where: { id: cursor }, select: { parentId: true } });
          cursor = parent?.parentId ?? null;
        }
      }
    }
    return covering;
  }

  // ── relevance scoring ──────────────────────────────────────────────────

  private queryTokens(q: string): string[] {
    return q
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);
  }

  private tokenOverlap(query: string, text: string): number {
    const qt = this.queryTokens(query);
    if (qt.length === 0) return 0;
    const hay = text.toLowerCase();
    let hits = 0;
    for (const t of qt) if (hay.includes(t)) hits++;
    return hits / qt.length;
  }

  /**
   * Composite relevance: version freshness, approval status, access
   * frequency, recency, context linkage, retention/hold importance,
   * and query overlap.
   */
  async relevanceScore(itemId: string, query?: string | null): Promise<{ score: number; factors: Record<string, number> }> {
    await this.assert("READ");
    const item = await this.owned(itemId);
    const current = await prisma.storageFileVersion.findFirst({ where: { itemId, versionNumber: item.version } });
    const linkCount = await prisma.fileLink.count({ where: { itemId } });
    const freshness = current
      ? current.status === VERSION_STATUS.CURRENT
        ? current.approvalStatus === APPROVAL_STATUS.APPROVED
          ? 1
          : 0.85
        : current.status === VERSION_STATUS.RECALLED
          ? 0.05
          : 0.5
      : 0.3;
    const approval = current
      ? current.approvalStatus === APPROVAL_STATUS.APPROVED
        ? 1
        : current.approvalStatus === APPROVAL_STATUS.PENDING
          ? 0.6
          : current.approvalStatus === APPROVAL_STATUS.REJECTED
            ? 0.2
            : 0.4
      : 0.3;
    const access = 1 - Math.exp(-(item.accessCount || 0) / 5);
    const ref = item.lastAccessedAt ?? item.updatedAt;
    const recency = Math.max(0, 1 - (Date.now() - ref.getTime()) / (30 * 86_400_000));
    const linkage = Math.min(1, linkCount / 3);
    const retention =
      item.legalHold || item.retentionMode === RETENTION_MODE.COMPLIANCE || item.retentionMode === RETENTION_MODE.IMMUTABLE
        ? 1
        : item.retentionMode === RETENTION_MODE.EXTENDED
          ? 0.6
          : 0.2;
    const overlap = query ? this.tokenOverlap(query, item.name) * 0.7 + this.tokenOverlap(query, await this.indexText(itemId)) * 0.3 : 0.5;
    const score = Math.min(
      1,
      0.2 * freshness + 0.2 * approval + 0.15 * access + 0.15 * recency + 0.15 * linkage + 0.05 * retention + 0.1 * overlap,
    );
    return {
      score: Math.round(score * 100) / 100,
      factors: { freshness, approval, access, recency, linkage, retention, overlap },
    };
  }

  private async indexText(itemId: string): Promise<string> {
    const idx = await prisma.fileIndex.findUnique({
      where: {
        workspaceId_objectType_objectId: {
          workspaceId: this.workspaceId,
          objectType: FILE_INDEX_OBJECT_TYPES.STORAGE_ITEM,
          objectId: itemId,
        },
      },
      select: { extractedText: true, ocrText: true },
    });
    return [idx?.extractedText, idx?.ocrText].filter(Boolean).join(" ").slice(0, 20_000);
  }

  /**
   * Rank files by relevance with compliance-aware filters.
   * Filters: mimeType, versionStatus, ownerId, dateFrom, dateTo, legalHold,
   * approvedOnly, accessedByMe, minScore, channelId (via file links).
   */
  async rankFiles(query?: string | null, filters?: {
    mimeType?: string | null;
    versionStatus?: string | null;
    ownerId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    legalHold?: boolean;
    approvedOnly?: boolean;
    accessedByMe?: boolean;
    minScore?: number;
    channelId?: string | null;
    limit?: number;
  }): Promise<
    Array<{
      item: Awaited<ReturnType<StorageService["owned"]>>;
      score: number;
      factors: Record<string, number>;
      currentVersionStatus: string | null;
      approvalStatus: string | null;
      indexState: string | null;
    }>
  > {
    await this.assert("READ");
    const where: Record<string, unknown> = {
      workspaceId: this.workspaceId,
      isFolder: false,
      trashedAt: null,
    };
    if (filters?.mimeType) where.mimeType = { startsWith: filters.mimeType };
    if (filters?.ownerId) where.createdById = filters.ownerId;
    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(filters.dateFrom);
      if (filters.dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(filters.dateTo);
    }
    if (filters?.legalHold) where.legalHold = true;
    if (filters?.accessedByMe) {
      const mine = await prisma.fileAccessLog.findMany({
        where: { workspaceId: this.workspaceId, actorId: this.userId, action: { in: [LOG_ACTION.VIEW, LOG_ACTION.DOWNLOAD, LOG_ACTION.PREVIEW] } },
        select: { itemId: true },
        distinct: ["itemId"],
      });
      where.id = { in: mine.map((m) => m.itemId).filter(Boolean) as string[] };
    }
    let items = await prisma.storageItem.findMany({ where, take: 300 });
    if (filters?.channelId) {
      const channelMsgIds = await prisma.chatMessage.findMany({
        where: { workspaceId: this.workspaceId, channelId: filters.channelId },
        select: { id: true },
        take: 500,
      });
      const linked = await prisma.fileLink.findMany({
        where: { workspaceId: this.workspaceId, objectId: { in: [...channelMsgIds.map((m) => m.id), filters.channelId] } },
        select: { itemId: true },
      });
      const linkedIds = new Set(linked.map((l) => l.itemId));
      items = items.filter((i) => linkedIds.has(i.id));
    }
    const results = [];
    for (const item of items) {
      const current = await prisma.storageFileVersion.findFirst({ where: { itemId: item.id, versionNumber: item.version } });
      const idx = await prisma.fileIndex.findUnique({
        where: {
          workspaceId_objectType_objectId: {
            workspaceId: this.workspaceId,
            objectType: FILE_INDEX_OBJECT_TYPES.STORAGE_ITEM,
            objectId: item.id,
          },
        },
        select: { indexState: true },
      });
      if (filters?.versionStatus && (current?.status ?? "") !== filters.versionStatus) continue;
      if (filters?.approvedOnly && current?.approvalStatus !== APPROVAL_STATUS.APPROVED) continue;
      const { score, factors } = await this.relevanceScore(item.id, query);
      if (filters?.minScore != null && score < filters.minScore) continue;
      results.push({
        item,
        score,
        factors,
        currentVersionStatus: current?.status ?? null,
        approvalStatus: current?.approvalStatus ?? null,
        indexState: idx?.indexState ?? null,
      });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, filters?.limit ?? 50);
  }

  // ── file-to-context links ──────────────────────────────────────────────

  async linkFile(input: { itemId: string; objectType: string; objectId: string; versionNumber?: number | null }) {
    await this.assert("UPDATE");
    await this.owned(input.itemId);
    const existing = await prisma.fileLink.findFirst({
      where: {
        workspaceId: this.workspaceId,
        itemId: input.itemId,
        objectType: input.objectType,
        objectId: input.objectId,
        versionNumber: input.versionNumber ?? null,
      },
    });
    const link =
      existing ??
      (await prisma.fileLink.create({
        data: {
          workspaceId: this.workspaceId,
          itemId: input.itemId,
          objectType: input.objectType,
          objectId: input.objectId,
          versionNumber: input.versionNumber ?? null,
          createdById: this.userId,
        },
      }));
    await this.audit("storage.file.linked", input.itemId, { objectType: input.objectType, objectId: input.objectId });
    return link;
  }

  async unlinkFile(input: { itemId: string; objectType: string; objectId: string; versionNumber?: number | null }) {
    await this.assert("UPDATE");
    await this.owned(input.itemId);
    await prisma.fileLink.deleteMany({
      where: {
        workspaceId: this.workspaceId,
        itemId: input.itemId,
        objectType: input.objectType,
        objectId: input.objectId,
        versionNumber: input.versionNumber ?? null,
      },
    });
    await this.audit("storage.file.unlinked", input.itemId, { objectType: input.objectType, objectId: input.objectId });
  }

  async linksForItem(itemId: string) {
    await this.assert("READ");
    await this.owned(itemId);
    return prisma.fileLink.findMany({ where: { workspaceId: this.workspaceId, itemId }, orderBy: { createdAt: "desc" } });
  }

  async linkedItems(objectType: string, objectId: string) {
    await this.assert("READ");
    const links = await prisma.fileLink.findMany({
      where: { workspaceId: this.workspaceId, objectType, objectId },
      include: { item: { select: { id: true, name: true, mimeType: true, version: true } } },
    });
    return links;
  }

  // ── evidence pack ──────────────────────────────────────────────────────

  /** Compliance evidence dossier: metadata, versions, chained access logs, hold events, approvals, linked context. */
  async evidencePack(itemId: string) {
    await this.assert("READ");
    const item = await this.owned(itemId);
    const versions = await prisma.storageFileVersion.findMany({ where: { itemId }, orderBy: { versionNumber: "desc" } });
    const accessLogs = await prisma.fileAccessLog.findMany({
      where: { workspaceId: this.workspaceId, objectId: itemId },
      orderBy: { chainIndex: "asc" },
      take: 500,
    });
    const chain = await this.verifyAuditChain();
    const holds = await prisma.fileLegalHold.findMany({
      where: { workspaceId: this.workspaceId, OR: [{ objectId: itemId }, { scope: HOLD_SCOPE.WORKSPACE }] },
      orderBy: { placedAt: "desc" },
    });
    const links = await prisma.fileLink.findMany({ where: { workspaceId: this.workspaceId, itemId } });
    const index = await prisma.fileIndex.findUnique({
      where: {
        workspaceId_objectType_objectId: {
          workspaceId: this.workspaceId,
          objectType: FILE_INDEX_OBJECT_TYPES.STORAGE_ITEM,
          objectId: itemId,
        },
      },
    });
    const linkedContext: Array<{ objectType: string; objectId: string; excerpt: string | null; versionNumber: number | null }> = [];
    const messageLinkIds = links.filter((l) => l.objectType === LINK_TYPES.MESSAGE || l.objectType === LINK_TYPES.THREAD).map((l) => l.objectId);
    if (messageLinkIds.length > 0) {
      const msgs = await prisma.chatMessage.findMany({
        where: { workspaceId: this.workspaceId, id: { in: messageLinkIds } },
        select: { id: true, body: true },
        take: 50,
      });
      const byId = new Map(msgs.map((m) => [m.id, m]));
      for (const l of links) {
        if (l.objectType === LINK_TYPES.MESSAGE) {
          linkedContext.push({
            objectType: l.objectType,
            objectId: l.objectId,
            excerpt: byId.get(l.objectId)?.body?.slice(0, 500) ?? null,
            versionNumber: l.versionNumber,
          });
        }
      }
    }
    const approvalEvents = accessLogs.filter((l) => [LOG_ACTION.APPROVED, LOG_ACTION.REJECTED, LOG_ACTION.RECALLED, LOG_ACTION.HOLD_PLACED, LOG_ACTION.HOLD_RELEASED].includes(l.action as never));
    return {
      generatedAt: new Date().toISOString(),
      workspaceId: this.workspaceId,
      exportedBy: this.userId,
      file: {
        id: item.id,
        name: item.name,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        checksum: item.checksum,
        currentVersion: item.version,
        retentionMode: item.retentionMode,
        retainUntil: item.retainUntil?.toISOString() ?? null,
        complianceLocked: item.complianceLocked,
        immutable: item.immutable,
        legalHold: item.legalHold,
        legalHoldReason: item.legalHoldReason,
        trashedAt: item.trashedAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        lastAccessedAt: item.lastAccessedAt?.toISOString() ?? null,
        accessCount: item.accessCount,
      },
      index: index
        ? {
            indexState: index.indexState,
            entities: index.entities,
            topics: index.topics,
            extractedTextLength: (index.extractedText ?? "").length,
            ocrTextLength: (index.ocrText ?? "").length,
            indexedAt: index.indexedAt?.toISOString() ?? null,
          }
        : null,
      versions: versions.map((v) => ({
        versionNumber: v.versionNumber,
        status: v.status,
        approvalStatus: v.approvalStatus,
        changeSummary: v.changeSummary,
        checksum: v.checksum,
        sizeBytes: v.sizeBytes,
        createdById: v.createdById,
        approvedById: v.approvedById,
        approvedAt: v.approvedAt?.toISOString() ?? null,
        recalledAt: v.recalledAt?.toISOString() ?? null,
        recallReason: v.recallReason,
        isLocked: v.isLocked,
        createdAt: v.createdAt.toISOString(),
      })),
      accessLogs: accessLogs.map((l) => ({
        chainIndex: l.chainIndex,
        action: l.action,
        actorId: l.actorId,
        actorName: l.actorName,
        objectId: l.objectId,
        versionNumber: l.versionNumber,
        outcome: l.outcome,
        policyApplied: l.policyApplied,
        ip: l.ip,
        details: l.details,
        hash: l.hash,
        chainPrev: l.chainPrev,
        createdAt: l.createdAt.toISOString(),
      })),
      chainVerification: { valid: chain.valid, entries: chain.entries, broken: chain.broken.length },
      legalHolds: holds.map((h) => ({
        id: h.id,
        scope: h.scope,
        objectId: h.objectId,
        matterName: h.matterName,
        reason: h.reason,
        placedById: h.placedById,
        placedAt: h.placedAt.toISOString(),
        releasedById: h.releasedById,
        releasedAt: h.releasedAt?.toISOString() ?? null,
        active: h.active,
      })),
      approvalEvents,
      links: links.map((l) => ({ objectType: l.objectType, objectId: l.objectId, versionNumber: l.versionNumber, createdAt: l.createdAt.toISOString() })),
      linkedContext,
    };
  }

  // ── shared helpers ─────────────────────────────────────────────────────

  private async owned(id: string) {
    const item = await prisma.storageItem.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!item) throw new Error("Storage item not found in this workspace");
    return item;
  }
}

export function checksumOf(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
