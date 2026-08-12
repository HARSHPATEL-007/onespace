import { prisma } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "chat";

export interface ThreadSummary {
  short: string;
  bullets: string[];
  decisions: Array<{ text: string; status: string; sourceMessageId?: string }>;
  actions: Array<{ title: string; owner?: string; dueDate?: string; priority: string; confidence: number }>;
  openIssues: string[];
  followUpSuggestion?: string;
}

export interface ExtractedActionItem {
  title: string;
  ownerName?: string;
  ownerUserId?: string;
  dueDate?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  sourceQuote: string;
  confidence: number;
}

const COMMITMENT_PATTERNS = [
  /I'll\s+(?:do|handle|take care of|work on|prepare|send|review|finish)\s+(.+?)(?:\.|$)/i,
  /I will\s+(.+?)(?:\.|$)/i,
  /please\s+(?:send|prepare|review|handle|do|create|update)\s+(.+?)(?:\.|$)/i,
  /(?:let's|we should|we need to)\s+(.+?)(?:\.|$)/i,
  /(?:can you|could you)\s+(.+?)(?:\?|$)/i,
  /(?:by|before|due)\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|tomorrow|next week|end of day|EOD|EOY|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i,
];

const PRIORITY_KEYWORDS: Record<string, ExtractedActionItem["priority"]> = {
  urgent: "CRITICAL", asap: "CRITICAL", critical: "CRITICAL", blocker: "CRITICAL",
  important: "HIGH", high: "HIGH", priority: "HIGH",
  low: "LOW", minor: "LOW", trivial: "LOW",
};

export class ThreadMemoryService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for thread memory`);
    }
  }

  async getOrCreateThreadMetadata(threadId: string, rootMessageId: string, channelId: string) {
    await this.assert("READ");
    const existing = await prisma.threadMetadata.findUnique({ where: { threadId } });
    if (existing) return existing;

    const parentMessage = await prisma.chatMessage.findFirst({ where: { id: rootMessageId } });
    return prisma.threadMetadata.create({
      data: {
        threadId, rootMessageId, channelId, workspaceId: this.workspaceId,
        title: parentMessage ? parentMessage.body.slice(0, 60) : "Thread",
        depth: 0, branchPath: [rootMessageId] as any,
      },
    });
  }

  async getThreadTree(threadId: string) {
    await this.assert("READ");
    const thread = await prisma.threadMetadata.findUnique({
      where: { threadId },
      include: {
        childThreads: { orderBy: { lastActivityAt: "desc" } },
        decisions: { orderBy: { createdAt: "desc" } },
        actionItems: { orderBy: { createdAt: "desc" } },
        pins: true,
      },
    });
    return thread;
  }

  async getBreadcrumbs(threadId: string) {
    await this.assert("READ");
    const breadcrumbs: Array<{ id: string; title: string }> = [];
    let current = await prisma.threadMetadata.findUnique({ where: { threadId } });

    while (current) {
      breadcrumbs.unshift({ id: current.threadId, title: current.title });
      if (!current.parentThreadId) break;
      current = await prisma.threadMetadata.findUnique({ where: { threadId: current.parentThreadId } });
      if (!current) break;
    }
    return breadcrumbs;
  }

  async generateSummary(threadId: string): Promise<ThreadSummary> {
    await this.assert("CREATE");
    const thread = await prisma.threadMetadata.findUnique({
      where: { threadId },
      include: { decisions: true, actionItems: true },
    });

    if (!thread) throw new Error("Thread not found");

    const messages = await prisma.chatMessage.findMany({
      where: { channelId: thread.channelId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    const conversation = messages.map(m => `${m.authorName}: ${m.body}`).join("\n");
    const decisions = thread.decisions.map(d => ({ text: d.decisionText, status: d.status, sourceMessageId: d.sourceMessageId ?? undefined }));
    const actions = thread.actionItems.map(a => ({ title: a.title, owner: a.ownerName ?? undefined, dueDate: a.dueDate?.toISOString(), priority: a.priority, confidence: a.confidence }));

    const summary: ThreadSummary = {
      short: `Thread with ${thread.replyCount} replies and ${thread.participantCount} participants.`,
      bullets: [
        `Started with: ${thread.title}`,
        `${decisions.length} decisions extracted`,
        `${actions.length} action items identified`,
      ],
      decisions,
      actions,
      openIssues: actions.filter(a => a.priority === "HIGH" || a.priority === "CRITICAL").map(a => a.title),
      followUpSuggestion: actions.length > 0 ? `Follow up on ${actions[0]?.title}` : undefined,
    };

    await prisma.threadMetadata.update({
      where: { threadId },
      data: { summaryShort: summary.short, summaryBullets: summary.bullets as any },
    });

    return summary;
  }

  async extractActionItems(threadId: string, messageId?: string): Promise<ExtractedActionItem[]> {
    await this.assert("CREATE");
    const thread = await prisma.threadMetadata.findUnique({ where: { threadId } });
    if (!thread) throw new Error("Thread not found");

    const messages = await prisma.chatMessage.findMany({
      where: { channelId: thread.channelId, deletedAt: null, ...(messageId ? { id: messageId } : {}) },
      orderBy: { createdAt: "asc" },
    });

    const extracted: ExtractedActionItem[] = [];

    for (const msg of messages) {
      for (const pattern of COMMITMENT_PATTERNS) {
        const match = msg.body.match(pattern);
        if (!match) continue;

        const text = match[0]?.trim();
        if (!text || text.length < 10) continue;

        let priority: ExtractedActionItem["priority"] = "MEDIUM";
        for (const [keyword, p] of Object.entries(PRIORITY_KEYWORDS)) {
          if (msg.body.toLowerCase().includes(keyword)) { priority = p; break; }
        }

        const dueDate = this.extractDueDate(msg.body);

        extracted.push({
          title: text.replace(/\.$/, ""),
          ownerName: msg.authorName,
          dueDate: dueDate?.toISOString(),
          priority,
          sourceQuote: msg.body.slice(0, 200),
          confidence: 0.7,
        });
      }
    }

    for (const item of extracted) {
      await prisma.threadActionItem.create({
        data: {
          threadId, workspaceId: this.workspaceId,
          sourceQuote: item.sourceQuote, title: item.title,
          ownerName: item.ownerName, dueDate: item.dueDate ? new Date(item.dueDate) : null,
          priority: item.priority, confidence: item.confidence, extractedBy: "AI_AUTO",
        },
      });
    }

    return extracted;
  }

  private extractDueDate(text: string): Date | undefined {
    const now = new Date();
    if (/tomorrow/i.test(text)) { now.setDate(now.getDate() + 1); return now; }
    if (/next week/i.test(text)) { now.setDate(now.getDate() + 7); return now; }
    if (/end of day|EOD/i.test(text)) { now.setHours(17, 0, 0, 0); return now; }
    const dayMatch = text.match(/(?:by|before|due)\s+(Monday|Tuesday|Wednesday|Thursday|Friday)/i);
    if (dayMatch) {
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const targetDay = days.indexOf(dayMatch[1]!);
      const daysUntil = (targetDay + 7 - now.getDay()) % 7 || 7;
      now.setDate(now.getDate() + daysUntil);
      return now;
    }
    return undefined;
  }

  async createDecision(threadId: string, data: { decisionText: string; sourceMessageId?: string; sourceQuote?: string; authorName?: string }) {
    await this.assert("CREATE");
    return prisma.threadDecision.create({
      data: {
        threadId, workspaceId: this.workspaceId,
        decisionText: data.decisionText, sourceMessageId: data.sourceMessageId,
        sourceQuote: data.sourceQuote, authorName: data.authorName,
        status: "PROPOSED", confidence: 0.8,
      },
    });
  }

  async updateDecisionStatus(decisionId: string, status: "PROPOSED" | "CONFIRMED" | "SUPERSEDED" | "REVOKED") {
    await this.assert("UPDATE");
    return prisma.threadDecision.update({
      where: { id: decisionId },
      data: { status, ...(status === "CONFIRMED" ? { approvedBy: this.userId, approvedAt: new Date() } : {}) },
    });
  }

  async searchThreads(query: string, options?: { channelId?: string; status?: string; hasDecisions?: boolean; hasActions?: boolean; pinned?: boolean }) {
    await this.assert("READ");
    const where: any = { workspaceId: this.workspaceId };
    if (query) where.OR = [{ title: { contains: query, mode: "insensitive" } }, { summaryShort: { contains: query, mode: "insensitive" } }, { labels: { has: query } }];
    if (options?.channelId) where.channelId = options.channelId;
    if (options?.status) where.status = options.status;
    if (options?.hasDecisions) where.decisions = { some: {} };
    if (options?.hasActions) where.actionItems = { some: { status: { in: ["OPEN", "IN_PROGRESS"] } } };
    if (options?.pinned) where.pins = { some: {} };

    return prisma.threadMetadata.findMany({
      where,
      include: { decisions: true, actionItems: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }, pins: true },
      orderBy: [{ lastActivityAt: "desc" }],
      take: 50,
    });
  }

  async pinThread(threadId: string, pinType: "ROOM" | "PERSONAL" | "PRIORITY", reason?: string, expiresAt?: Date) {
    await this.assert("CREATE");
    return prisma.threadPin.upsert({
      where: { id: threadId + ":" + this.userId },
      create: { threadId, workspaceId: this.workspaceId, userId: this.userId, pinType, reason, expiresAt },
      update: { pinType, reason, expiresAt },
    });
  }

  async exportThread(threadId: string, format: "MARKDOWN" | "PDF" | "DOCX" | "JSON", exportMode: "FULL" | "BRANCH" | "RANGE" | "SUMMARY_ONLY" | "SUMMARY_TRANSCRIPT") {
    await this.assert("CREATE");
    const thread = await prisma.threadMetadata.findUnique({
      where: { threadId },
      include: { decisions: true, actionItems: true },
    });
    if (!thread) throw new Error("Thread not found");

    const messages = await prisma.chatMessage.findMany({
      where: { channelId: thread.channelId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });

    let content = "";
    if (format === "MARKDOWN" || format === "JSON") {
      content = this.formatAsMarkdown(thread, messages, exportMode);
    } else {
      content = this.formatAsMarkdown(thread, messages, exportMode);
    }

    return prisma.threadExport.create({
      data: { threadId, workspaceId: this.workspaceId, createdById: this.userId, format, exportMode, content, fileSize: content.length },
    });
  }

  private formatAsMarkdown(thread: any, messages: any[], mode: string): string {
    let md = `# ${thread.title}\n\n`;
    md += `> Thread ID: ${thread.threadId} | Channel: ${thread.channelId} | Exported: ${new Date().toISOString()}\n\n`;
    if (thread.summaryShort) md += `## Summary\n${thread.summaryShort}\n\n`;
    if (thread.summaryBullets?.length) { md += (thread.summaryBullets as string[]).map(b => `- ${b}`).join("\n") + "\n\n"; }
    if (thread.decisions?.length) { md += "## Decisions\n" + thread.decisions.map((d: any) => `- [${d.status}] ${d.decisionText}`).join("\n") + "\n\n"; }
    if (thread.actionItems?.length) { md += "## Action Items\n" + thread.actionItems.map((a: any) => `- [${a.status}] ${a.title} (${a.priority})`).join("\n") + "\n\n"; }
    if (mode !== "SUMMARY_ONLY") { md += "## Transcript\n\n" + messages.map(m => `**${m.authorName}** (${new Date(m.createdAt).toLocaleString()}):\n${m.body}\n`).join("\n---\n\n"); }
    return md;
  }
}
