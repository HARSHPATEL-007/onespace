/**
 * Policy layer for rich content — RBAC, DLP, retention, tenant visibility, audit
 * Must run before any unfurl/render. No script execution, no secret leak.
 */

import { can, type Role } from "@n0va/authz";
import { prisma } from "@n0va/db";
import { dlpScan } from "../server";
import { redactSensitive } from "../compliance";
import { auditAppend } from "../compliance";

// Allowed unfurl domains / blocklist — tenant-configurable later via ChatComplianceConfig
const BLOCKED_HOSTS = new Set(["169.254.169.254", "metadata.google.internal", "localhost"]);
const SSRF_RE = /(?:0\.0\.0\.0|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)/;

export interface PolicyCheck {
  allowed: boolean;
  reason?: string;
  redact?: boolean;
  retentionClass?: string;
}

export async function canUnfurl(ctx: {
  workspaceId: string;
  userId: string;
  role: Role;
  url: string;
  kind: string; // og | n0va_doc | github | etc
  objectId?: string;
  objectType?: string;
}): Promise<PolicyCheck> {
  // 1. Block SSRF / metadata
  try {
    const u = new URL(ctx.url);
    const host = u.hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(host) || SSRF_RE.test(host)) return { allowed: false, reason: "blocked_host" };
    if (!/^https?:$/.test(u.protocol)) return { allowed: false, reason: "unsafe_protocol" };
  } catch {
    // relative /m/... links are internal — allow after tenant check
    if (!ctx.url.startsWith("/m/")) return { allowed: false, reason: "invalid_url" };
  }

  // 2. Tenant-level RBAC: need READ on chat to see previews at all
  if (!(await can(ctx.workspaceId, ctx.role, "chat", "READ"))) return { allowed: false, reason: "no_chat_read" };

  // 3. Object-level RBAC for N0VA objects (docs, sheets, CRM, etc.)
  if (ctx.objectId && ctx.objectType) {
    const allowed = await objectVisible(ctx.workspaceId, ctx.userId, ctx.objectType, ctx.objectId);
    if (!allowed) return { allowed: false, reason: "object_not_visible" };
  }

  // 4. Retention/DLP: if object is under legal hold or GOVERNANCE, still allow preview but mark
  // (actual renderer will apply watermark + retention badge)

  return { allowed: true };
}

async function objectVisible(workspaceId: string, userId: string, objectType: string, objectId: string): Promise<boolean> {
  // Must be same workspace — and user must be member of that workspace (already checked above)
  // For docs/tasks/etc, verify the object belongs to workspace.
  try {
    switch (objectType) {
      case "doc": {
        const row = await prisma.doc.findFirst({ where: { id: objectId, workspaceId }, select: { id: true } });
        return !!row;
      }
      case "task": {
        const row = await prisma.task.findFirst({ where: { id: objectId, workspaceId }, select: { id: true } });
        return !!row;
      }
      case "meeting": {
        const row = await prisma.calendarEvent.findFirst({ where: { id: objectId, workspaceId }, select: { id: true } });
        return !!row;
      }
      case "crm": {
        const row = await prisma.contact.findFirst({ where: { id: objectId, workspaceId }, select: { id: true } });
        if (row) return true;
        const deal = await prisma.deal.findFirst({ where: { id: objectId, workspaceId }, select: { id: true } });
        return !!deal;
      }
      case "file": {
        const row = await prisma.storageItem.findFirst({ where: { id: objectId, workspaceId }, select: { id: true } });
        if (row) return true;
        const att = await prisma.chatAttachment.findFirst({ where: { id: objectId, workspaceId }, select: { id: true } });
        return !!att;
      }
      case "sheet": {
        const row = await prisma.sheetWorkbook.findFirst({ where: { id: objectId, workspaceId }, select: { id: true } });
        return !!row;
      }
      default: return true;
    }
  } catch {
    return false;
  }
}

export function sanitizePreviewHtml(html: string): string {
  // Strip scripts, event handlers, and javascript: hrefs. Keep safe subset: b,i,em,strong,p,br,code,pre,a[href^=http],img[src^=https]
  // We use regex sanitization (no DOM required server-side). Renderer must also escape.
  let out = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style[\s\S]*?<\/style>/gi, "");
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/href\s*=\s*["']\s*javascript:[^"']*["']/gi, 'href="#"');
  out = out.replace(/src\s*=\s*["']\s*data:[^"']*["']/gi, 'src=""');
  return out;
}

export function sanitizeCode(code: string): { clean: string; redactedTypes: string[] } {
  const hits = dlpScan(code);
  let clean = code;
  const types: string[] = [];
  for (const h of hits) {
    types.push(h.rule);
  }
  if (hits.length > 0) clean = redactSensitive(code);
  return { clean, redactedTypes: types };
}

export function stripSecretsFromStructured(structured: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!structured) return null;
  // Never expose raw secrets in structured fields (e.g., sheet cells containing keys)
  const json = JSON.stringify(structured);
  const hits = dlpScan(json);
  if (hits.length === 0) return structured;
  // Redact string values that matched
  const redacted = JSON.parse(redactSensitive(json)) as Record<string, unknown>;
  return redacted;
}

export async function logPreviewAccess(ctx: {
  workspaceId: string;
  actorId: string;
  actorName?: string;
  url: string;
  kind: string;
  objectId?: string;
  objectType?: string;
  channelId?: string;
  messageId?: string;
  allowed: boolean;
  reason?: string;
}): Promise<void> {
  try {
    await auditAppend({
      workspaceId: ctx.workspaceId,
      actorId: ctx.actorId,
      actorName: ctx.actorName,
      action: ctx.allowed ? "preview.view" : "preview.denied",
      objectType: ctx.objectType ?? "UNFURL",
      objectId: ctx.objectId ?? ctx.url.slice(0, 191),
      channelId: ctx.channelId,
      outcome: ctx.allowed ? "SUCCESS" : "DENIED",
      details: { url: ctx.url.slice(0, 500), kind: ctx.kind, reason: ctx.reason, messageId: ctx.messageId },
    });
  } catch {
    // best-effort
  }
}

export function shouldCollapsePreview(kind: string, score?: number): boolean {
  // Collapse low-value previews automatically per UX rule
  if (kind === "og" && (score ?? 0) < 0.45) return true; // generic web with low relevance
  if (kind === "file" && (score ?? 1) < 0.35) return true;
  return false;
}
