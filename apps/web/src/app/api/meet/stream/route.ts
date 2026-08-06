import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { subscribeRoom } from "@n0va/modules-meet";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const roomId = url.searchParams.get("roomId");
  if (!roomId) return new Response("Bad request", { status: 400 });

  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const room = await prisma.meetRoom.findFirst({
    where: { id: roomId, workspace: { members: { some: { userId: session.user.id, status: "ACTIVE" } } } },
    include: {
      participants: {
        where: { leftAt: null },
        select: { id: true, userId: true, name: true, joinedAt: true },
        orderBy: { joinedAt: "asc" },
      },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!room) return new Response("Not found", { status: 404 });

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // disconnected
        }
      };

      send({
        type: "initial",
        participants: room.participants,
        messages: room.messages,
      });

      const unsubscribe = subscribeRoom(roomId, (payload) => {
        const p = payload as { type: string };
        if (p.type === "presence" || p.type === "message" || p.type === "ended") send(payload);
      });
      const ping = setInterval(() => send({ type: "ping" }), 25000);
      req.signal.addEventListener("abort", () => {
        clearInterval(ping);
        unsubscribe();
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
