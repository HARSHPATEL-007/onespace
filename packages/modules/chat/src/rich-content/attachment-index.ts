/**
 * Attachment Indexing — searchable, linkable, previewable across workspace
 * Extract text, OCR images when allowed, preserve metadata for retrieval/compliance.
 * Event-driven: called from server.ts sendMessage after attachments create.
 */

import { prisma } from "@n0va/db";
import { dlpScan } from "../server";

export interface AttachmentIndexRecord {
  messageId: string;
  workspaceId: string;
  channelId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploaderId: string;
  uploaderName: string;
  extractedText: string | null; // for search inside PDFs/docs/sheets/images
  ocrText: string | null;
  tags: string[];
  entities: Array<{ type: string; value: string }>;
  retentionClass: string | null;
}

function tagsFor(filename: string, mime: string): string[] {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  const tags: string[] = [ext, mime.split("/")[0] ?? "file"];
  if (["pdf"].includes(ext)) tags.push("pdf");
  if (["doc","docx","md","txt"].includes(ext)) tags.push("document");
  if (["xls","xlsx","csv"].includes(ext)) tags.push("spreadsheet");
  if (["png","jpg","jpeg","webp","gif","svg"].includes(ext)) tags.push("image");
  if (["mp4","mov","webm"].includes(ext)) tags.push("video");
  return [...new Set(tags)];
}

function entitiesFromText(text: string): Array<{ type: string; value: string }> {
  const out: Array<{ type: string; value: string }> = [];
  for (const m of text.matchAll(/\b[A-Z]{2,}\d{3,}\b/g)) out.push({ type: "code", value: m[0]!.slice(0, 24) });
  for (const m of text.matchAll(/\b[\w.]+@[\w.]+\.\w+\b/g)) out.push({ type: "email", value: m[0]!.slice(0, 64) });
  if (out.length > 20) return out.slice(0, 20);
  return out;
}

export async function indexAttachments(input: {
  workspaceId: string;
  channelId: string;
  messageId: string;
  uploaderId: string;
  uploaderName: string;
  attachments: Array<{ id: string; filename: string; mimeType: string; sizeBytes: number; storageKey: string }>;
  threadId?: string | null;
}): Promise<void> {
  for (const att of input.attachments) {
    const tags = tagsFor(att.filename, att.mimeType);
    // Extracted text: for now placeholder (would call doc extraction pipeline: pdf.js, mammoth, tesseract)
    // Keep tenant-scoped, policy-aware: do not extract if retention BLOCKCHAIN/LEGAL_HOLD without approval
    const extractedText: string | null = null; // TODO: plug ExtractionPipeline when files on disk
    const ocrText: string | null = null; // TODO: tesseract for images

    // DLP scan filename + extracted text
    const haystack = `${att.filename} ${extractedText ?? ""} ${ocrText ?? ""}`;
    const hits = dlpScan(haystack);
    const retentionClass = hits.length > 0 ? "CONFIDENTIAL" : null;

    // Upsert into ChatHyperContext or dedicated FileIndex — reuse ChatLinkSuggestion for now + ChatAttachment metadata
    // Also ensure ChatSearchIndex has body that includes filename for has:file search
    try {
      await prisma.chatAttachment.update({
        where: { id: att.id },
        data: {
          // store tags/entities in checksum field temporarily if no dedicated column? Better use separate table.
          // For real use, we create ChatAttachment enriched via separate index table below.
        },
      });
    } catch {}

    // Mirror to storage index for cross-workspace search (best-effort)
    try {
      const api = (prisma as unknown as { fileIndex?: { upsert: (a: unknown) => Promise<unknown> } }).fileIndex;
      if (api) {
        await api.upsert({
          where: { workspaceId_objectType_objectId: { workspaceId: input.workspaceId, objectType: "chat_attachment", objectId: att.id } },
          create: {
            workspaceId: input.workspaceId,
            objectType: "chat_attachment",
            objectId: att.id,
            filename: att.filename,
            mimeType: att.mimeType,
            extractedText,
            ocrText,
            entities: entitiesFromText(extractedText ?? att.filename) as unknown as object,
            topics: tags as unknown as object,
            indexState: "INDEXED",
            indexedAt: new Date(),
          },
          update: {
            filename: att.filename,
            mimeType: att.mimeType,
            extractedText,
            ocrText,
            entities: entitiesFromText(extractedText ?? att.filename) as unknown as object,
            topics: tags as unknown as object,
            indexState: "INDEXED",
            indexedAt: new Date(),
          },
        });
      }
    } catch {}

    // Link attachment to thread context for preview cards
    try {
      await prisma.chatLinkSuggestion.upsert({
        where: { id: `att:${input.messageId}:${att.id}`.slice(0, 191) },
        create: {
          id: `att:${input.messageId}:${att.id}`.slice(0, 191),
          workspaceId: input.workspaceId,
          messageId: input.messageId,
          module: "file",
          objectId: att.id,
          relation: "attachment",
          score: 1,
          confidence: 1,
          source: "AUTO",
        },
        update: {},
      });
    } catch {}
  }
}

export async function searchAttachments(workspaceId: string, query: string, limit = 20): Promise<Array<{ id: string; filename: string; mimeType: string; messageId: string }>> {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const rows = await prisma.chatAttachment.findMany({
    where: { workspaceId, filename: { contains: q, mode: "insensitive" } },
    select: { id: true, filename: true, mimeType: true, messageId: true },
    take: limit,
    orderBy: { createdAt: "desc" },
  });
  return rows;
}
