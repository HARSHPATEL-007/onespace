import { prisma } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "bots";

export type TriggerType = "SLASH_COMMAND" | "MENTION" | "WEBHOOK" | "SCHEDULED" | "AI_TRIGGER";

export interface CommandContext {
  botId: string;
  userId: string;
  workspaceId: string;
  channelId: string;
  command: string;
  args: string[];
  roomId?: string;
  threadId?: string;
}

export class BotEngine {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for bots`);
    }
  }

  async createBot(input: { name: string; description?: string; avatarUrl?: string; persona?: Record<string, unknown>; knowledgeScopes?: string[]; permissions?: Record<string, unknown>; triggers?: Array<{ type: TriggerType; config: Record<string, unknown> }> }) {
    await this.assert("CREATE");
    const bot = await prisma.bot.create({
      data: {
        workspaceId: this.workspaceId, createdById: this.userId, name: input.name, description: input.description ?? "",
        avatarUrl: input.avatarUrl, persona: (input.persona ?? {}) as any, knowledgeScopes: input.knowledgeScopes ?? [],
        permissions: (input.permissions ?? {}) as any,
      },
    });

    if (input.triggers) {
      for (const trigger of input.triggers) {
        await prisma.botTrigger.create({ data: { botId: bot.id, type: trigger.type, config: trigger.config as any } });
      }
    }

    await prisma.botAuditLog.create({ data: { botId: bot.id, action: "bot.created", actorId: this.userId, details: { name: input.name } } });
    return bot;
  }

  async executeCommand(ctx: CommandContext): Promise<{ success: boolean; output: string; data?: Record<string, unknown> }> {
    await this.assert("CREATE");

    const bot = await prisma.bot.findFirst({ where: { id: ctx.botId, workspaceId: ctx.workspaceId, status: "ACTIVE" }, include: { triggers: true } });
    if (!bot) throw new Error("Bot not found or inactive");

    const trigger = bot.triggers.find(t => t.type === "SLASH_COMMAND" && (t.config as any).command === ctx.command);
    if (!trigger) throw new Error(`Command ${ctx.command} not found`);

    const startTime = Date.now();
    try {
      const result = await this.runCommand(ctx, bot.persona as any);
      await prisma.botExecution.create({ data: { botId: bot.id, triggerId: trigger.id, triggerType: "SLASH_COMMAND", input: ctx as any, output: { result } as any, status: "COMPLETED", durationMs: Date.now() - startTime } });
      await prisma.botAuditLog.create({ data: { botId: bot.id, action: "command.executed", actorId: ctx.userId, details: { command: ctx.command } } });
      return result;
    } catch (e) {
      await prisma.botExecution.create({ data: { botId: bot.id, triggerId: trigger.id, triggerType: "SLASH_COMMAND", input: ctx as any, status: "FAILED", durationMs: Date.now() - startTime, errorMessage: e instanceof Error ? e.message : "Unknown error" } });
      throw e;
    }
  }

  private async runCommand(ctx: CommandContext, persona: Record<string, unknown>): Promise<{ success: boolean; output: string; data?: Record<string, unknown> }> {
    switch (ctx.command) {
      case "/remind":
        return { success: true, output: `Reminder set: ${ctx.args.join(" ") || "No message"}`, data: { type: "reminder", message: ctx.args.join(" ") } };
      case "/poll":
        return { success: true, output: `Poll created: ${ctx.args[0] || "Untitled"}`, data: { type: "poll", question: ctx.args[0], options: ctx.args.slice(1) } };
      case "/task":
        return { success: true, output: `Task created: ${ctx.args.join(" ")}`, data: { type: "task", title: ctx.args.join(" ") } };
      case "/schedule":
        return { success: true, output: `Meeting scheduled: ${ctx.args.join(" ")}`, data: { type: "meeting", title: ctx.args.join(" ") } };
      case "/summarize":
        return { success: true, output: `Summarizing thread ${ctx.threadId ?? "current"}...`, data: { type: "summary", threadId: ctx.threadId } };
      case "/search":
        return { success: true, output: `Searching: ${ctx.args.join(" ")}`, data: { type: "search", query: ctx.args.join(" ") } };
      case "/assign":
        return { success: true, output: `Assigned to: ${ctx.args[0] || "unassigned"}`, data: { type: "assign", target: ctx.args[0] } };
      case "/approve":
        return { success: true, output: `Approval triggered for: ${ctx.args.join(" ")}`, data: { type: "approval", target: ctx.args.join(" ") } };
      default:
        return { success: false, output: `Unknown command: ${ctx.command}` };
    }
  }

  async handleWebhook(botId: string, payload: Record<string, unknown>): Promise<{ success: boolean; output: string }> {
    await this.assert("CREATE");
    const webhook = await prisma.botWebhook.findFirst({ where: { botId, direction: "INCOMING", enabled: true } });
    if (!webhook) throw new Error("No incoming webhook configured");

    const startTime = Date.now();
    await prisma.botExecution.create({ data: { botId, triggerType: "WEBHOOK", input: payload as any, status: "COMPLETED", durationMs: Date.now() - startTime } });
    return { success: true, output: "Webhook processed" };
  }

  async handleAITrigger(botId: string, message: string, signals: Record<string, number>): Promise<{ triggered: boolean; output: string }> {
    await this.assert("CREATE");
    const trigger = await prisma.botTrigger.findFirst({ where: { botId, type: "AI_TRIGGER", enabled: true } });
    if (!trigger) return { triggered: false, output: "" };

    const config = trigger.config as Record<string, number>;
    const triggered = Object.entries(config).every(([key, threshold]) => (signals[key] ?? 0) >= threshold);

    if (triggered) {
      await prisma.botExecution.create({ data: { botId, triggerId: trigger.id, triggerType: "AI_TRIGGER", input: { message, signals } as any, status: "COMPLETED" } });
      return { triggered: true, output: `AI trigger activated for bot ${botId}` };
    }
    return { triggered: false, output: "" };
  }

  async listBots(): Promise<any[]> {
    await this.assert("READ");
    return prisma.bot.findMany({ where: { workspaceId: this.workspaceId }, include: { triggers: true, _count: { select: { executions: true } } } });
  }

  async getBot(id: string): Promise<any> {
    await this.assert("READ");
    return prisma.bot.findFirst({ where: { id, workspaceId: this.workspaceId }, include: { triggers: true, webhooks: true, executions: { orderBy: { createdAt: "desc" }, take: 20 }, auditLogs: { orderBy: { createdAt: "desc" }, take: 20 } } });
  }

  async deleteBot(id: string): Promise<void> {
    await this.assert("DELETE");
    await prisma.bot.delete({ where: { id } });
  }
}
