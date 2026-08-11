import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { command, channelId, limit = 50 } = body;

  if (!command || !channelId) {
    return NextResponse.json({ error: "command and channelId required" }, { status: 400 });
  }

  const messages = await prisma.chatMessage.findMany({
    where: { channelId, workspaceId: ctx.workspace.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const conversation = messages.reverse().map(m => `${m.authorName}: ${m.body}`).join("\n");

  switch (command) {
    case "/summarize": {
      const summary = await callAI(
        `Summarize this chat conversation concisely (3-5 bullet points):\n\n${conversation}`,
        ctx.workspace.id,
      );
      return NextResponse.json({ result: summary, command });
    }
    case "/smart-reply": {
      const lastMsg = messages[messages.length - 1];
      if (!lastMsg) return NextResponse.json({ result: "No messages to reply to.", command });
      const reply = await callAI(
        `Suggest a brief, natural reply to this message: "${lastMsg.body}"`,
        ctx.workspace.id,
      );
      return NextResponse.json({ result: reply, command });
    }
    case "/translate": {
      const targetLang = body.targetLang ?? "es";
      const lastMsg = messages[messages.length - 1];
      if (!lastMsg) return NextResponse.json({ result: "No messages to translate.", command });
      const translated = await callAI(
        `Translate this message to ${targetLang}: "${lastMsg.body}"`,
        ctx.workspace.id,
      );
      return NextResponse.json({ result: translated, command });
    }
    case "/action-items": {
      const items = await callAI(
        `Extract action items from this conversation as a numbered list:\n\n${conversation}`,
        ctx.workspace.id,
      );
      return NextResponse.json({ result: items, command });
    }
    case "/sentiment": {
      const sentiment = await callAI(
        `Analyze the overall sentiment of this conversation (positive/negative/neutral, 1-2 sentences):\n\n${conversation}`,
        ctx.workspace.id,
      );
      return NextResponse.json({ result: sentiment, command });
    }
    default:
      return NextResponse.json({
        error: "Unknown command. Try: /summarize, /smart-reply, /translate, /action-items, /sentiment",
      }, { status: 400 });
  }
}

async function callAI(prompt: string, workspaceId: string): Promise<string> {
  try {
    const res = await fetch(process.env.NEXT_PUBLIC_APP_URL + "/api/ani", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: prompt, workspaceId, depth: "quick" }),
    });

    if (!res.ok) return "AI service unavailable.";

    const data = await res.json();
    return data.response ?? data.result ?? "No response generated.";
  } catch {
    return "AI service temporarily unavailable.";
  }
}
