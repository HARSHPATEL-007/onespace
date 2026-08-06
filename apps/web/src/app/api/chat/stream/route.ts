import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { subscribe } from "@n0va/modules-chat";

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
    where: { channelId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // client disconnected
        }
      };

      send({ type: "initial", messages: initial.reverse() });
      const unsubscribe = subscribe(workspaceId, (payload) => {
        const msg = payload as { type: string };
        if (msg.type === "message") send(payload);
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
