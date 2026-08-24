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

  async generateSummary(threadId: string): Promise<ThreadSummary & { quotes?: Array<{ author: string; text: string; at: string }>; confidence?: number; version?: number }> {
    await this.assert("CREATE");
    const thread = await prisma.threadMetadata.findUnique({
      where: { threadId },
      include: { decisions: true, actionItems: true },
    });
    if (!thread) throw new Error("Thread not found");

    // Fetch full branch: all messages in channel that belong to this thread tree
    const rootId = thread.rootMessageId;
    const allMessages = await prisma.chatMessage.findMany({
      where: { channelId: thread.channelId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    // Build tree filter: keep root + descendants
    const isDescendant = (m: typeof allMessages[number]): boolean => {
      if (m.id === rootId) return true;
      let cur: string | null = m.parentId;
      let g = 0;
      while (cur && g < 20) {
        if (cur === rootId) return true;
        const parent = allMessages.find((x) => x.id === cur);
        cur = parent?.parentId ?? null;
        g++;
      }
      return false;
    };
    const messages = allMessages.filter(isDescendant);
    if (messages.length === 0) throw new Error("No messages in thread");

    // Extract decisions from language and existing decisions
    const decisionPatterns = [/we decided|agreed|approved|confirmed|decision:?\s/i, /proceed with|go ahead|ship it/i];
    const detectedDecisions = messages
      .filter((m) => decisionPatterns.some((re) => re.test(m.body)))
      .slice(0, 5)
      .map((m) => ({ text: m.body.slice(0, 140).replace(/\n/g, " "), status: "PROPOSED" as const, sourceMessageId: m.id, confidence: 0.72 }));

    const mergedDecisions = [...thread.decisions.map((d) => ({ text: d.decisionText, status: d.status, sourceMessageId: d.sourceMessageId ?? undefined, confidence: d.confidence })), ...detectedDecisions].slice(0, 8);

    const actions = thread.actionItems.map((a) => ({ title: a.title, owner: a.ownerName ?? undefined, dueDate: a.dueDate?.toISOString(), priority: a.priority as ThreadSummary["actions"][number]["priority"], confidence: a.confidence, sourceQuote: a.sourceQuote }));
    // Also run live extraction for open issues: unconfirmed commitments
    const openIssues = actions.filter((a) => a.priority === "HIGH" || a.priority === "CRITICAL").map((a) => a.title);
    const hasUnresolved = messages.some((m) => /\?|unresolved|pending|todo|open question/i.test(m.body));
    const openList = openIssues.length > 0 ? openIssues : hasUnresolved ? ["Unresolved questions in thread — review last 3 messages"] : [];

    // 1-line summary: extractive
    const first = messages[0]?.body.replace(/\s+/g, " ").slice(0, 120) ?? thread.title;
    const short = mergedDecisions[0] ? `${mergedDecisions[0].text.slice(0, 90)}` : `Branch “${first.slice(0, 60)}…” — ${messages.length} messages, ${thread.participantCount || 1} participants`;

    const bullets = [
      `Started: ${thread.title.slice(0, 80)}`,
      `${mergedDecisions.length} decision(s) • ${actions.length} action item(s) • ${openList.length} open issue(s)`,
      `Last activity ${thread.lastActivityAt.toLocaleString()} • depth ${thread.depth} • ${thread.replyCount} replies`,
    ];

    const quotes = messages.slice(-3).map((m) => ({ author: m.authorName, text: m.body.slice(0, 120), at: m.createdAt.toISOString() }));
    const confidence = Math.min(0.92, 0.55 + messages.length * 0.02 + mergedDecisions.length * 0.05);

    const summary: ThreadSummary & { quotes?: Array<{ author: string; text: string; at: string }>; confidence?: number; version?: number } = {
      short,
      bullets,
      decisions: mergedDecisions.map((d) => ({ text: d.text, status: d.status, sourceMessageId: d.sourceMessageId })),
      actions: actions.map((a) => ({ title: a.title, owner: a.owner, dueDate: a.dueDate, priority: a.priority, confidence: a.confidence })),
      openIssues: openList,
      followUpSuggestion: actions[0] ? `Follow up: ${actions[0].title} — ${actions[0].owner ?? "unassigned"} ${actions[0].dueDate ? `by ${new Date(actions[0].dueDate).toLocaleDateString()}` : ""}`.trim() : quotes[0] ? `Reply to ${quotes[0].author}: “${quotes[0].text.slice(0, 40)}…”` : undefined,
      quotes,
      confidence,
      version: (thread as unknown as { summaryVersion?: number }).summaryVersion ? (thread as unknown as { summaryVersion: number }).summaryVersion + 1 : 1,
    };

    await prisma.threadMetadata.update({
      where: { threadId },
      data: { summaryShort: summary.short, summaryBullets: summary.bullets as unknown as object, lastActivityAt: new Date() },
    });

    // Also store versioned summary in ThreadExport for history (best-effort)
    try {
      await prisma.threadExport.create({
        data: { threadId, workspaceId: this.workspaceId, createdById: this.userId, format: "JSON", exportMode: "SUMMARY_ONLY", content: JSON.stringify(summary, null, 2), fileSize: JSON.stringify(summary).length },
      });
    } catch {}

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

  async searchThreads(query: string, options?: { channelId?: string; status?: string; hasDecisions?: boolean; hasActions?: boolean; pinned?: boolean; assignee?: string; unresolved?: boolean; archived?: boolean; semantic?: boolean }) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (query) {
      const q = query.trim();
      // RBAC: only threads in rooms user can access — ChatMember check via channel members (best-effort: filter by workspaceId already)
      (where as unknown as { OR?: unknown[] }).OR = [
        { title: { contains: q, mode: "insensitive" } },
        { summaryShort: { contains: q, mode: "insensitive" } },
        { branchPath: { array_contains: q } } as unknown,
        { labels: { has: q } },
        { decisions: { some: { decisionText: { contains: q, mode: "insensitive" } } } },
        { actionItems: { some: { title: { contains: q, mode: "insensitive" } } } },
      ];
      // Quoted phrase exact
      if (q.startsWith('"') && q.endsWith('"')) {
        const phrase = q.slice(1, -1);
        (where as unknown as { OR: unknown[] }).OR = [
          { title: { contains: phrase, mode: "insensitive" } },
          { decisions: { some: { sourceQuote: { contains: phrase, mode: "insensitive" } } } },
        ];
      }
    }
    if (options?.channelId) where.channelId = options.channelId;
    if (options?.status) where.status = options.status;
    if (options?.hasDecisions) where.decisions = { some: {} };
    if (options?.hasActions) where.actionItems = { some: { status: { in: ["OPEN", "IN_PROGRESS"] } } };
    if (options?.pinned) where.pins = { some: {} };
    if (options?.unresolved) where.actionItems = { some: { status: { in: ["OPEN", "IN_PROGRESS"] } } };
    if (options?.archived) where.status = "ARCHIVED";
    if (options?.assignee) where.actionItems = { some: { ownerName: { contains: options.assignee, mode: "insensitive" } } };

    const results = await prisma.threadMetadata.findMany({
      where: where as unknown as object,
      include: { decisions: true, actionItems: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }, pins: true },
      orderBy: [{ lastActivityAt: "desc" }],
      take: 50,
    });
    // Keep source room/thread ID in every result is inherent (threadId, channelId, workspaceId)
    return results;
  }

  async pinThread(threadId: string, pinType: "ROOM" | "PERSONAL" | "PRIORITY", reason?: string, expiresAt?: Date) {
    await this.assert("CREATE");
    return prisma.threadPin.upsert({
      where: { id: threadId + ":" + this.userId },
      create: { threadId, workspaceId: this.workspaceId, userId: this.userId, pinType, reason, expiresAt },
      update: { pinType, reason, expiresAt },
    });
  }

  async exportThread(threadId: string, format: "MARKDOWN" | "PDF" | "DOCX" | "JSON", exportMode: "FULL" | "BRANCH" | "RANGE" | "SUMMARY_ONLY" | "SUMMARY_TRANSCRIPT", opts?: { rangeStart?: string; rangeEnd?: string; branchId?: string }) {
    await this.assert("CREATE");
    const thread = await prisma.threadMetadata.findUnique({
      where: { threadId },
      include: { decisions: true, actionItems: true, pins: true },
    });
    if (!thread) throw new Error("Thread not found");
    if (thread.workspaceId !== this.workspaceId) throw new Error("Forbidden");

    const allMessages = await prisma.chatMessage.findMany({
      where: { channelId: thread.channelId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: { attachments: true },
    });
    // Build branch filter
    let messages = allMessages;
    if (exportMode === "BRANCH" && opts?.branchId) {
      const branchPath = (thread.branchPath as unknown as string[]) ?? [];
      const idx = branchPath.indexOf(opts.branchId);
      const slice = idx >= 0 ? branchPath.slice(0, idx + 1) : branchPath;
      messages = allMessages.filter((m) => slice.includes(m.id) || m.id === opts!.branchId! || m.parentId === opts!.branchId);
    } else if (exportMode === "RANGE" && opts?.rangeStart && opts?.rangeEnd) {
      const start = new Date(opts.rangeStart).getTime();
      const end = new Date(opts.rangeEnd).getTime();
      messages = allMessages.filter((m) => { const t = new Date(m.createdAt).getTime(); return t >= start && t <= end; });
    } else if (exportMode === "SUMMARY_ONLY") {
      messages = [];
    }
    // SUMMARY_TRANSCRIPT keeps messages; FULL keeps all

    let content = "";
    if (format === "JSON") {
      content = JSON.stringify({
        thread_id: thread.threadId,
        room_id: thread.channelId,
        root_message_id: thread.rootMessageId,
        parent_thread_id: thread.parentThreadId,
        depth: thread.depth,
        branch_path: thread.branchPath,
        title: thread.title,
        summary: { short: thread.summaryShort, bullets: thread.summaryBullets },
        decisions: thread.decisions,
        actions: thread.actionItems,
        pins: thread.pins.length,
        labels: thread.labels,
        permissions: { visibility: thread.visibility },
        last_activity_at: thread.lastActivityAt.toISOString(),
        exported_at: new Date().toISOString(),
        exported_by: this.userId,
        messages: messages.map((m) => ({ id: m.id, author: m.authorName, at: m.createdAt.toISOString(), body: m.body, attachments: m.attachments.map((a) => a.filename) })),
        provenance: { workspaceId: this.workspaceId, threadId, exportMode, format },
      }, null, 2);
    } else {
      content = this.formatAsMarkdown(thread, messages, exportMode);
      // PDF/DOCX: server returns markdown; client converts (common workflow). For real DOCX we could use docx lib, but markdown is editable preservation.
      if (format === "PDF" || format === "DOCX") content = `<!-- ${format} export — markdown source, convert client-side -->\n` + content;
    }

    return prisma.threadExport.create({
      data: { threadId, workspaceId: this.workspaceId, createdById: this.userId, format, exportMode, content, fileSize: content.length },
    });
  }

  private formatAsMarkdown(thread: { title: string; threadId: string; channelId: string; summaryShort?: string | null; summaryBullets?: unknown; decisions?: Array<{ status: string; decisionText: string }>; actionItems?: Array<{ status: string; title: string; priority: string }> }, messages: Array<{ authorName: string; createdAt: Date | string; body: string; attachments?: Array<{ filename: string }> }>, mode: string): string {
    let md = `# ${thread.title}\n\n`;
    md += `> Thread ID: ${thread.threadId} | Room: ${thread.channelId} | Exported: ${new Date().toISOString()} | Mode: ${mode}\n\n`;
    if (thread.summaryShort) md += `## Summary\n${thread.summaryShort}\n\n`;
    if ((thread.summaryBullets as string[] | undefined)?.length) { md += (thread.summaryBullets as string[]).map((b) => `- ${b}`).join("\n") + "\n\n"; }
    if (thread.decisions?.length) { md += "## Decisions\n" + thread.decisions.map((d) => `- [${d.status}] ${d.decisionText}`).join("\n") + "\n\n"; }
    if (thread.actionItems?.length) { md += "## Action Items\n" + thread.actionItems.map((a) => `- [${a.status}] ${a.title} (${a.priority})`).join("\n") + "\n\n"; }
    md += `## Attachments & Embeds\n${messages.flatMap((m) => m.attachments ?? []).map((a) => `- ${a.filename}`).join("\n") || "_none_"}\n\n`;
    md += `## Provenance\nExported ${new Date().toISOString()} by ${this.userId} • thread tree preserved • source messages anchored\n\n`;
    if (mode !== "SUMMARY_ONLY") { md += "## Transcript\n\n" + (messages.length ? messages.map((m) => `**${m.authorName}** (${new Date(m.createdAt).toLocaleString()}):\n${m.body}\n`).join("\n---\n\n") : "_no transcript for summary-only_"); }
    return md;
  }
}
