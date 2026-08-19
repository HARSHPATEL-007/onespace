import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { subscribe } from "@n0va/modules-chat";
import { createClient } from "redis";

/**
 * SSE stream endpoint — fallback for when WebSocket is unavailable.
 *
 * Delivers:
 * 1. Initial messages from PostgreSQL
 * 2. Live events from in-memory pub/sub (same-process Server Actions)
 * 3. Live events from Redis pub/sub (cross-process / Rust gateway events)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId");
  const channelId = url.searchParams.get("channelId");
  if (!workspaceId || !channelId) {
    return new Response("Bad request", { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: session.user.id, status: "ACTIVE" },
  });
  if (!membership) {
    return new Response("Forbidden", { status: 403 });
  }

  const channel = await prisma.chatChannel.findFirst({
    where: { id: channelId, workspaceId },
  });
  if (!channel) {
    return new Response("Channel not found", { status: 404 });
  }

  const initial = await prisma.chatMessage.findMany({
    where: { channelId, parentId: null, deletedAt: null },
    include: { attachments: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const enc = new TextEncoder();
  let redisSub: Awaited<ReturnType<typeof createClient>> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // client disconnected
        }
      };

      // Send initial messages
      send({ type: "initial", messages: initial.reverse() });

      // Subscribe to in-memory events (from Server Actions)
      const unsubscribeMemory = subscribe(workspaceId, (payload) => {
        const msg = payload as { type: string; channel_id?: string; userId?: string };
        if (msg.type === "message" && msg.channel_id === channelId) {
          send(payload);
        } else if (msg.type === "message.deleted" && msg.channel_id === channelId) {
          send(payload);
        } else if (msg.type === "message.updated" && msg.channel_id === channelId) {
          send(payload);
        } else if (msg.type === "typing" && msg.channel_id === channelId) {
          send(payload);
        } else if (msg.type === "presence") {
          send(payload);
        } else if (msg.type === "notif" && msg.userId === session.user.id) {
          send(payload);
        }
      });

      // Subscribe to Redis events (from Rust gateway)
      const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
      try {
        redisSub = createClient({ url: redisUrl });
        await redisSub.connect();
        await redisSub.subscribe("n0va:chat:events", (message) => {
          try {
            const event = JSON.parse(message);
            if (event.workspace_id && event.workspace_id !== workspaceId) return;
            if (event.type === "message" && event.channel_id === channelId) {
              send({ type: "message", message: event.message });
            } else if (event.type === "message.deleted" && event.channel_id === channelId) {
              send(event);
            } else if (event.type === "message.updated" && event.channel_id === channelId) {
              send(event);
            } else if (event.type === "typing" && event.channel_id === channelId) {
              send(event);
            } else if (event.type === "presence") {
              send(event);
            } else if (event.type === "notif" && event.userId === session.user.id) {
              send(event);
            }
          } catch {
            // ignore parse errors
          }
        });
      } catch {
        // Redis unavailable — in-memory pub/sub still works
      }

      // Heartbeat to keep connection alive
      const ping = setInterval(() => send({ type: "ping" }), 25000);

      req.signal.addEventListener("abort", () => {
        clearInterval(ping);
        unsubscribeMemory();
        if (redisSub) redisSub.unsubscribe("n0va:chat:events").catch(() => {});
        redisSub?.quit().catch(() => {});
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
