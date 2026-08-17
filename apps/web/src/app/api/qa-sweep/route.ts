import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { ChatService } from "@n0va/modules-chat/server";
import { ThreadMemoryService } from "@n0va/modules-thread-memory/server";
import { NotificationEngine } from "@n0va/modules-notification-engine/server";
import { prisma } from "@n0va/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const out: Record<string, unknown> = {};
  const ws = ctx.workspace.id;
  const chat = new ChatService(ws, ctx.user.id, ctx.memberRole);
  const tm = new ThreadMemoryService(ws, ctx.user.id, ctx.memberRole);
  const ne = new NotificationEngine(ws, ctx.user.id, ctx.memberRole);
  const created: string[] = [];

  try {
    const channels = await prisma.chatChannel.findMany({
      where: { workspaceId: ws },
      orderBy: { createdAt: "asc" },
      take: 5,
    });
    const channel = channels[0];
    if (!channel) { out.channel = "FAIL: no channels"; return NextResponse.json(out); }
    created.push(`channel:${channel.id}`);

    // 1. Poll: create → vote → get → resolve
    try {
      const poll = await chat.createPoll(channel.id, "QA sweep poll?", ["Option A", "Option B", "Option C"], { ttlMinutes: 60 });
      const pollId = poll.id;
      created.push(`poll:${pollId}`);
      const voted = await chat.votePoll(pollId, 1);
      const got = await chat.getPoll(pollId);
      const resolved = await chat.resolvePoll(pollId);
      const final = await chat.getPoll(pollId);
      out.poll = {
        created: !!poll.id,
        messageLinked: poll.messageId === (await prisma.chatMessage.findFirst({ where: { pollId } }))?.id,
        voted: voted.myVote === 1,
        counts: got.options.map((o: { count: number; pct: number }) => `${o.count}/${o.pct}%`),
        statusAfterResolve: final?.status,
        totalVotes: final?.totalVotes,
      };
    } catch (e) { out.poll = { FAIL: e instanceof Error ? e.message : String(e) }; }

    // 2. Reminder: create → list → fire → cancel
    try {
      const future = new Date(Date.now() + 2 * 60_000);
      const r = await chat.createReminder("QA reminder test", future, { channelId: channel.id });
      created.push(`reminder:${r.id}`);
      const listed = await chat.listReminders("PENDING");
      const fired = await chat.fireDueReminders();
      const due = await prisma.reminder.create({
        data: { workspaceId: ws, userId: ctx.user.id, text: "QA due now", remindAt: new Date(Date.now() - 1000), channelId: channel.id },
      });
      created.push(`reminder:${due.id}`);
      const fired2 = await chat.fireDueReminders();
      const afterFire = await prisma.reminder.findFirst({ where: { id: due.id } });
      const cancelled = await chat.cancelReminder(r.id);
      const afterCancel = await prisma.reminder.findFirst({ where: { id: r.id } });
      out.reminder = {
        created: !!r.id,
        listed: listed.length > 0,
        firedPendingOnly: fired.total === 0,
        firedDue: fired2.fired === 1,
        firedStatus: afterFire?.status,
        cancelledStatus: afterCancel?.status,
      };
    } catch (e) { out.reminder = { FAIL: e instanceof Error ? e.message : String(e) }; }

    // 3. Sentiment search operator (no throw; shape ok)
    try {
      const neg = await chat.searchMessages("sentiment:negative");
      const pos = await chat.searchMessages("sentiment:positive");
      const neu = await chat.searchMessages("sentiment:neutral");
      out.sentimentOperator = {
        negative: Array.isArray(neg.messages),
        positive: Array.isArray(pos.messages),
        neutral: Array.isArray(neu.messages),
      };
    } catch (e) { out.sentimentOperator = { FAIL: e instanceof Error ? e.message : String(e) }; }

    // 4. Toxicity hook on send (best-effort; send must succeed)
    try {
      const msg = await chat.sendMessage(channel.id, "QA toxicity hook benign message", "QA Runner");
      created.push(`msg:${msg.id}`);
      const flag = await prisma.toxicityFlag.count({ where: { messageId: msg.id } });
      out.toxicityHook = { sent: !!msg.id, flagged: flag };
    } catch (e) { out.toxicityHook = { FAIL: e instanceof Error ? e.message : String(e) }; }

    // 5. Thread ops: pin → export → action items
    try {
      const parent = await chat.sendMessage(channel.id, "QA thread ops root message for sweep", "QA Runner");
      created.push(`msg:${parent.id}`);
      await tm.getOrCreateThreadMetadata(parent.id, parent.id, channel.id);
      const pin = await tm.pinThread(parent.id, "ROOM", "qa-sweep");
      const exportRes = await tm.exportThread(parent.id, "MARKDOWN", "FULL");
      const items = await tm.extractActionItems(parent.id);
      const actions = await prisma.threadActionItem.findMany({ where: { threadId: parent.id } });
      out.threadOps = {
        pinned: pin.pinType === "ROOM",
        exported: typeof exportRes.content === "string" && exportRes.content.length > 0,
        exportFormat: exportRes.format,
        extracted: Array.isArray(items),
        listed: Array.isArray(actions),
      };
    } catch (e) { out.threadOps = { FAIL: e instanceof Error ? e.message : String(e) }; }

    // 6. Digest
    try {
      const digest = await ne.getDigest(ctx.user.id);
      out.digest = { ok: true, shape: Array.isArray(digest) ? "array" : typeof digest };
    } catch (e) { out.digest = { FAIL: e instanceof Error ? e.message : String(e) }; }

    // 7. Edit history
    try {
      const msg = await chat.sendMessage(channel.id, "QA edit history v1", "QA Runner");
      created.push(`msg:${msg.id}`);
      await chat.editMessage(msg.id, "QA edit history v2");
      const edits = await prisma.chatMessageEdit.findMany({ where: { messageId: msg.id }, orderBy: { editedAt: "desc" } });
      out.editHistory = { recorded: edits.length >= 1, oldBody: edits[0]?.oldBody ?? null, newBody: edits[0]?.newBody ?? null };
    } catch (e) { out.editHistory = { FAIL: e instanceof Error ? e.message : String(e) }; }

    // Cleanup: remove QA artifacts (polls, reminders, msgs, thread pins/exports/decisions)
    try {
      const pollIds = (await prisma.chatPoll.findMany({ where: { workspaceId: ws, question: { startsWith: "QA " } } })).map(p => p.id);
      await prisma.chatPollVote.deleteMany({ where: { pollId: { in: pollIds } } });
      await prisma.chatPoll.deleteMany({ where: { id: { in: pollIds } } });
      await prisma.chatMessage.deleteMany({ where: { workspaceId: ws, authorName: "QA Runner" } });
      await prisma.chatMessage.deleteMany({ where: { workspaceId: ws, authorName: "Poll" } });
      await prisma.reminder.deleteMany({ where: { workspaceId: ws, text: { startsWith: "QA " } } });
      await prisma.threadPin.deleteMany({ where: { thread: { workspaceId: ws }, reason: "qa-sweep" } });
      const threads = await prisma.threadMetadata.findMany({
        where: { workspaceId: ws, rootMessageId: { in: (await prisma.chatMessage.findMany({ where: { workspaceId: ws, authorName: "QA Runner" }, select: { id: true } })).map(m => m.id) } },
      });
      await prisma.threadExport.deleteMany({ where: { threadId: { in: threads.map(t => t.id) } } });
      await prisma.threadActionItem.deleteMany({ where: { threadId: { in: threads.map(t => t.id) } } });
      await prisma.threadMetadata.deleteMany({ where: { id: { in: threads.map(t => t.id) } } });
      const leftoverPoll = await prisma.chatPoll.count({ where: { workspaceId: ws, question: { startsWith: "QA " } } });
      const leftoverMsgs = await prisma.chatMessage.count({ where: { workspaceId: ws, authorName: { in: ["QA Runner", "Poll"] } } });
      const leftoverReminders = await prisma.reminder.count({ where: { workspaceId: ws, text: { startsWith: "QA " } } });
      const leftoverThreadMeta = await prisma.threadMetadata.count({ where: { id: { in: threads.map(t => t.id) } } });
      const leftoverPins = await prisma.threadPin.count({ where: { reason: "qa-sweep" } });
      out.cleanup = { poll: leftoverPoll, msgs: leftoverMsgs, reminders: leftoverReminders, threadMeta: leftoverThreadMeta, pins: leftoverPins };
    } catch (e) { out.cleanup = { FAIL: e instanceof Error ? e.message : String(e) }; }

    out.createdCount = created.length;
  } catch (e) {
    out.global = { FAIL: e instanceof Error ? e.message : String(e) };
  }
  return NextResponse.json(out);
}
