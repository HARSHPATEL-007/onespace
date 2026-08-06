import { prisma, logAudit, type AniConversation, type AniMessage } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "ani";

export type ConversationWithMessages = AniConversation & { messages: AniMessage[] };

const TYPING_DELAYS = [700, 1100, 900, 1500];

export class AniService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for ani`);
    }
  }

  async conversations(): Promise<Array<ConversationWithMessages & { unread: number }>> {
    await this.assert("READ");
    const conversations = await prisma.aniConversation.findMany({
      where: { workspaceId: this.workspaceId },
      include: { messages: { orderBy: { createdAt: "desc" }, take: 2 } },
      orderBy: { updatedAt: "desc" },
    });
    return conversations.map((c) => ({ ...c, unread: c.messages.filter((m) => m.role === "assistant").length }));
  }

  async open(id: string): Promise<ConversationWithMessages> {
    await this.assert("READ");
    const conversation = await prisma.aniConversation.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!conversation) throw new Error("Conversation not found");
    return conversation;
  }

  async create(title: string): Promise<ConversationWithMessages> {
    await this.assert("CREATE");
    const conversation = await prisma.aniConversation.create({
      data: { workspaceId: this.workspaceId, createdById: this.userId, title: title || "New conversation" },
      include: { messages: true },
    });
    await this.audit("ani.conversation.created", conversation.id);
    return conversation;
  }

  async send(conversationId: string, content: string): Promise<{ userMessage: AniMessage; assistantMessage: AniMessage; delayMs: number }> {
    await this.assert("CREATE");
    const conversation = await prisma.aniConversation.findFirst({ where: { id: conversationId, workspaceId: this.workspaceId } });
    if (!conversation) throw new Error("Conversation not found");

    const userMessage = await prisma.aniMessage.create({
      data: { conversationId, workspaceId: this.workspaceId, role: "user", content },
    });

    const reply = this.composeReply(content, conversation.title);
    const assistantMessage = await prisma.aniMessage.create({
      data: { conversationId, workspaceId: this.workspaceId, role: "assistant", content: reply },
    });
    await prisma.aniConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

    const messageCount = await prisma.aniMessage.count({ where: { conversationId } });
    const delayMs = TYPING_DELAYS[messageCount % TYPING_DELAYS.length] ?? 900;
    return { userMessage, assistantMessage, delayMs };
  }

  async clear(id: string): Promise<void> {
    await this.assert("DELETE");
    await prisma.aniMessage.deleteMany({ where: { conversationId: id, workspaceId: this.workspaceId } });
    await prisma.aniConversation.update({ where: { id }, data: { updatedAt: new Date() } });
  }

  async remove(id: string): Promise<void> {
    await this.assert("DELETE");
    await prisma.aniConversation.delete({ where: { id } });
    await this.audit("ani.conversation.deleted", id);
  }

  private composeReply(userContent: string, title: string): string {
    const lower = userContent.toLowerCase();
    if (lower.includes("schedule") || lower.includes("meeting")) {
      return `I can help with that. As a demo assistant, I'd normally pull your calendar and propose times — for now, here's a tip: the Calendar module in N0VA lets you bulk-import events, and Meeting sends invites that auto-link to docs. Want me to draft an agenda?`;
    }
    if (lower.includes("draft") || lower.includes("doc") || lower.includes("write")) {
      return `Gladly. I can draft a doc for "${title}". In this sandbox my drafting is simulated, but the Docs module has real templates — I'd create a doc titled "${title} draft" and link it back here.`;
    }
    if (lower.includes("summar")) {
      return `Summary mode (demo): I'd scan the most recent docs, messages, and task activity in this workspace and return a 5-bullet digest. This workspace has activity across 10+ modules, so expect roughly 3-5 bullets per digest.`;
    }
    return `Understood — noted on "${title}". In the full N0VA1O build, this reply would route through the configured model, with the conversation context attached. For now, this is the ANI sandbox replying to: "${userContent.slice(0, 90)}${userContent.length > 90 ? "…" : ""}"`;
  }
}
