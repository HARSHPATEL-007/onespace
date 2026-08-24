/**
 * Preview Pipeline — event-driven, permission-aware, resolves message → visual objects
 * Runs on message create (server.ts buildHyperContextFor) and on explicit refresh.
 * Each message resolves to 0..N cards; primary card expanded, rest collapsed.
 */

import { analyzeMessage } from "./analyzer";
import { unfurlMany } from "./unfurl";
import { resolveWithAdapters } from "./adapters";
import { toCardFromPreview, type RichCard } from "./cards";
import { prisma } from "@n0va/db";
import type { Role } from "@n0va/authz";

export interface PipelineInput {
  workspaceId: string;
  userId: string;
  role: Role;
  channelId: string;
  messageId: string;
  body: string;
  attachments?: Array<{ filename: string; mimeType: string; sizeBytes: number }>;
  createdAt?: Date;
  actorName?: string;
}

export interface PipelineResult {
  analysis: ReturnType<typeof analyzeMessage>;
  cards: RichCard[];
  // For storage: preview count, primary kind
  meta: { cardCount: number; primaryKind: string | null; hasCode: boolean };
}

export async function runPreviewPipeline(input: PipelineInput): Promise<PipelineResult> {
  const analysis = analyzeMessage(input.body, input.attachments ?? []);

  // Early exit: no URLs, no N0VA refs, no attachments needing cards — still may have code blocks handled separately
  const urls = analysis.urls.map((u) => u.cleanUrl);
  const cards: RichCard[] = [];

  // 1. Resolve N0VA internal objects via adapters (cached, permission-aware)
  if (urls.length > 0) {
    const adapterPreviews = await resolveWithAdapters(urls, {
      workspaceId: input.workspaceId,
      userId: input.userId,
      role: input.role,
      channelId: input.channelId,
      messageId: input.messageId,
      actorName: input.actorName,
    });
    for (const p of adapterPreviews) {
      const domain = (() => { try { return new URL(p.url).hostname; } catch { return "n0va.internal"; } })();
      cards.push(toCardFromPreview(p, { collapsed: cards.length > 0, sourceDomain: domain }));
    }
    // 2. External OG unfurl for remaining URLs not already resolved
    const unresolved = urls.filter((u) => !adapterPreviews.some((pr) => pr.url === u));
    const external = unresolved.filter((u) => !u.startsWith("/m/"));
    if (external.length > 0) {
      const ogResults = await unfurlMany(external, {
        workspaceId: input.workspaceId,
        userId: input.userId,
        role: input.role,
        channelId: input.channelId,
        messageId: input.messageId,
        actorName: input.actorName,
      });
      for (const p of ogResults) {
        // Avoid duplicate if adapter already produced same URL
        if (cards.some((c) => c.id === p.url)) continue;
        const domain = (() => { try { return new URL(p.url).hostname; } catch { return undefined; } })();
        cards.push(toCardFromPreview(p, { collapsed: cards.length > 0, sourceDomain: domain }));
      }
    }
  }

  // UX: one primary action per card already enforced in cards.ts; collapsed for low-value handled in pipeline
  // Performance: cap total cards to 4 (dense chat rule)
  const capped = cards.slice(0, 4);

  // Persist preview refs on ChatMessage for renderer + search (best-effort, no hard failure)
  try {
    await prisma.chatMessage.update({
      where: { id: input.messageId },
      data: {
        // Store minimal preview meta in existing fields if available; otherwise rely on cache table
        // We use ChatHyperContext.actions to stash cards for now (no schema migration required)
      },
    });
    // Stash cards into ChatHyperContext.links as preview cards for immediate render without extra fetch
    if (capped.length > 0) {
      const existing = await prisma.chatHyperContext.findUnique({ where: { messageId: input.messageId } });
      if (existing) {
        const links = (existing.links as unknown as unknown[]) ?? [];
        const actions = (existing.actions as unknown as unknown[]) ?? [];
        await prisma.chatHyperContext.update({
          where: { messageId: input.messageId },
          data: {
            links: [...links, ...capped.map((c) => ({ module: "preview", objectId: c.id, relation: "unfurl", kind: c.kind, title: c.title }))] as unknown as object,
            actions: [...actions, { type: "rich_cards", cards: capped }] as unknown as object,
          },
        });
      }
    }
  } catch {
    // best-effort
  }

  return {
    analysis,
    cards: capped,
    meta: { cardCount: capped.length, primaryKind: capped[0]?.kind ?? null, hasCode: analysis.hasCode },
  };
}

// Refresh hook: re-run for a message when source object changes (e.g., doc title edited)
export async function refreshMessagePreviews(messageId: string, ctx: { workspaceId: string; userId: string; role: Role; actorName?: string }): Promise<PipelineResult | null> {
  const msg = await prisma.chatMessage.findFirst({ where: { id: messageId, workspaceId: ctx.workspaceId }, select: { id: true, body: true, channelId: true, createdAt: true } });
  if (!msg) return null;
  const atts = await prisma.chatAttachment.findMany({ where: { messageId, workspaceId: ctx.workspaceId }, select: { filename: true, mimeType: true, sizeBytes: true } });
  return runPreviewPipeline({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    role: ctx.role,
    channelId: msg.channelId,
    messageId: msg.id,
    body: msg.body,
    attachments: atts.map((a) => ({ filename: a.filename, mimeType: a.mimeType, sizeBytes: a.sizeBytes })),
    createdAt: msg.createdAt,
    actorName: ctx.actorName,
  });
}
