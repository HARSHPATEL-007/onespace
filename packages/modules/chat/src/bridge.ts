/**
 * Chat bridge: consumes domain events (task.*, huddle.*) and posts a live
 * system message to the originating chat channel. Wired once per process
 * alongside the event bus relay/projections (see apps/web/src/lib/eventbus.ts).
 * Best-effort: never throws, never blocks the bus loop.
 */
import { prisma } from "@n0va/db";
import type { CanonicalEvent } from "@n0va/modules-events/server";
import { publish } from "./emitter";
import { renderMarkdown, detectLanguage } from "./server";

const BRIDGE = "chat-bridge";

const HANDLED: Record<string, (p: Record<string, unknown>) => string | null> = {
  "task.created": (p) => {
    const title = typeof p.title === "string" ? p.title : "";
    if (!title) return null;
    return `📋 Task created: ${title}`;
  },
  "task.completed": (p) => {
    const title = typeof p.title === "string" ? p.title : "";
    if (!title) return null;
    return `✅ Task completed: ${title}`;
  },
  "huddle.started": (p) => {
    const name = typeof p.name === "string" ? p.name : "Huddle";
    return `🎙️ Huddle started: ${name}`;
  },
  "huddle.ended": (p) => {
    const name = typeof p.name === "string" ? p.name : "Huddle";
    return `🔇 Huddle ended: ${name}`;
  },
};

export async function bridgeEvent(event: CanonicalEvent): Promise<void> {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const render = HANDLED[event.eventType];
  if (!render) return;
  const body = render(payload);
  if (!body) return;
  const workspaceId = typeof event.tenantId === "string" ? event.tenantId : null;
  const channelId = typeof payload.channelId === "string" ? payload.channelId : null;
  if (!workspaceId || !channelId) return;

  try {
    const channel = await prisma.chatChannel.findFirst({ where: { id: channelId, workspaceId } });
    if (!channel) return;
    const actorId = typeof payload.completedBy === "string"
      ? payload.completedBy
      : typeof payload.createdBy === "string"
        ? payload.createdBy
        : null;
    const actor = actorId ? await prisma.user.findUnique({ where: { id: actorId }, select: { name: true, email: true } }) : null;
    const authorName = actor?.name ?? actor?.email ?? "N0VA";

    const message = await prisma.chatMessage.create({
      data: {
        channelId,
        workspaceId,
        createdById: actorId ?? "",
        authorName,
        body,
        bodyHtml: renderMarkdown(body),
        lang: detectLanguage(body),
      },
    });
    await prisma.chatChannel.update({ where: { id: channelId }, data: { updatedAt: new Date() } });
    publish(workspaceId, {
      type: "message",
      message: {
        id: message.id,
        channelId: message.channelId,
        workspaceId: message.workspaceId,
        createdById: message.createdById,
        authorName: message.authorName,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      },
    });
  } catch {
    // best-effort: never break the bus
  }
}