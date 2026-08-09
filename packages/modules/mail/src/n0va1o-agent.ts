/**
 * N0VA MAIL — N0VA1O Agent Integration
 *
 * Agent personas, tool registry, and agent-driven mail workflows.
 * Integrates with N0VA1O gateway for AI agent automation.
 */

// ── Types ──────────────────────────────────────────────────

export type AgentPersona =
  | "mail_concierge"
  | "reply_assistant"
  | "meeting_agent"
  | "task_extractor"
  | "crm_sync"
  | "compliance_agent"
  | "threat_hunter"
  | "executive_brief"
  | "cross_module"
  | "custom";

export interface MailAgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (params: Record<string, unknown>, context: AgentContext) => Promise<AgentToolResult>;
}

export interface AgentContext {
  workspaceId: string;
  userId: string;
  mailboxId?: string;
  threadId?: string;
  persona: AgentPersona;
  autonomyLevel: "low" | "medium" | "high" | "full";
}

export interface AgentToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  requiresApproval?: boolean;
  riskScore?: number;
}

export interface AgentWorkflow {
  id: string;
  name: string;
  description: string;
  persona: AgentPersona;
  triggers: string[];
  steps: WorkflowStep[];
  status: "active" | "paused" | "completed";
}

export interface WorkflowStep {
  id: string;
  action: string;
  params: Record<string, unknown>;
  condition?: string;
  onError?: "skip" | "retry" | "escalate";
}

// ── Agent Persona Definitions ──────────────────────────────

export const AGENT_PERSONAS: Record<AgentPersona, {
  label: string;
  description: string;
  autonomyLevel: "low" | "medium" | "high" | "full";
  capabilities: string[];
}> = {
  mail_concierge: {
    label: "Mail Concierge",
    description: "Autonomous inbox management — sort, label, prioritize, archive",
    autonomyLevel: "high",
    capabilities: ["read", "label", "move", "archive", "prioritize"],
  },
  reply_assistant: {
    label: "Reply Assistant",
    description: "Draft responses with tone adjustment and context awareness",
    autonomyLevel: "medium",
    capabilities: ["read", "draft", "tone_adjust", "summarize"],
  },
  meeting_agent: {
    label: "Meeting Agent",
    description: "Parse meeting requests, propose times, book calendar",
    autonomyLevel: "high",
    capabilities: ["read", "calendar_create", "calendar_check", "draft"],
  },
  task_extractor: {
    label: "Task Extractor",
    description: "Extract action items from emails and create tasks",
    autonomyLevel: "high",
    capabilities: ["read", "task_create", "task_assign", "due_date_extract"],
  },
  crm_sync: {
    label: "CRM Sync Agent",
    description: "Log email interactions, update deals, score leads",
    autonomyLevel: "high",
    capabilities: ["read", "crm_log", "crm_update", "lead_score"],
  },
  compliance_agent: {
    label: "Compliance Agent",
    description: "DLP scan, retention enforcement, legal hold management",
    autonomyLevel: "high",
    capabilities: ["read", "dlp_scan", "retention_apply", "legal_hold"],
  },
  threat_hunter: {
    label: "Threat Hunter",
    description: "Phishing detection, anomaly flagging, security alerts",
    autonomyLevel: "full",
    capabilities: ["read", "security_scan", "quarantine", "alert"],
  },
  executive_brief: {
    label: "Executive Brief",
    description: "Generate priority briefings and daily digests",
    autonomyLevel: "medium",
    capabilities: ["read", "summarize", "prioritize", "digest"],
  },
  cross_module: {
    label: "Cross-Module Agent",
    description: "Orchestrate workflows across CRM, Tasks, Calendar, Docs",
    autonomyLevel: "medium",
    capabilities: ["read", "multi_module", "workflow_trigger"],
  },
  custom: {
    label: "Custom Agent",
    description: "User-defined agent with configurable capabilities",
    autonomyLevel: "low",
    capabilities: [],
  },
};

// ── Tool Registry ─────────────────────────────────────────

export function getMailAgentTools(): MailAgentTool[] {
  return [
    {
      name: "mail.get_message",
      description: "Retrieve full message by ID",
      parameters: { message_id: { type: "string" }, include_body: { type: "boolean", default: true } },
      handler: async (params, ctx) => {
        const { prisma } = await import("@n0va/db");
        const msg = await prisma.mailMessage.findFirst({
          where: { id: params.message_id as string, workspaceId: ctx.workspaceId },
          include: { labels: { include: { label: true } } },
        });
        return { success: true, data: msg };
      },
    },
    {
      name: "mail.search_messages",
      description: "Search messages with operators and filters",
      parameters: { query: { type: "string" }, filters: { type: "object" }, limit: { type: "number", default: 20 } },
      handler: async (params, ctx) => {
        const { prisma } = await import("@n0va/db");
        const where: Record<string, unknown> = { workspaceId: ctx.workspaceId };
        if (params.query) {
          where.OR = [
            { subject: { contains: params.query as string, mode: "insensitive" } },
            { body: { contains: params.query as string, mode: "insensitive" } },
          ];
        }
        const results = await prisma.mailMessage.findMany({ where, take: (params.limit as number) || 20, orderBy: { sentAt: "desc" } });
        return { success: true, data: results };
      },
    },
    {
      name: "mail.send_message",
      description: "Send an email message",
      parameters: { to: { type: "array" }, subject: { type: "string" }, body: { type: "string" } },
      handler: async (params, ctx) => {
        const { prisma } = await import("@n0va/db");
        const msg = await prisma.mailMessage.create({
          data: {
            workspaceId: ctx.workspaceId, threadId: crypto.randomUUID(), direction: "OUT", folder: "SENT", status: "SENT",
            fromName: "N0VA Agent", fromEmail: "agent@n0va.workspace",
            toEmails: params.to as string[], subject: params.subject as string, body: params.body as string, isRead: true,
          },
        });
        return { success: true, data: { messageId: msg.id } };
      },
    },
    {
      name: "mail.summarize_thread",
      description: "Generate AI summary of an email thread",
      parameters: { thread_id: { type: "string" }, style: { type: "enum", values: ["bullets", "narrative", "actions"], default: "bullets" } },
      handler: async (params, ctx) => {
        const { prisma } = await import("@n0va/db");
        const messages = await prisma.mailMessage.findMany({
          where: { workspaceId: ctx.workspaceId, threadId: params.thread_id as string },
          orderBy: { sentAt: "asc" },
        });
        const summary = messages.map((m) => `${m.fromEmail}: ${m.body.slice(0, 100)}`).join("\n");
        return { success: true, data: { summary, messageCount: messages.length } };
      },
    },
    {
      name: "mail.extract_action_items",
      description: "Extract todos and action items from a message or thread",
      parameters: { thread_id: { type: "string" } },
      handler: async (params, ctx) => {
        const { prisma } = await import("@n0va/db");
        const messages = await prisma.mailMessage.findMany({
          where: { workspaceId: ctx.workspaceId, threadId: params.thread_id as string },
        });
        const items = messages
          .filter((m) => m.body.toLowerCase().includes("action") || m.body.toLowerCase().includes("todo") || m.body.toLowerCase().includes("please"))
          .map((m) => ({ from: m.fromEmail, text: m.body.slice(0, 150) }));
        return { success: true, data: { actionItems: items } };
      },
    },
    {
      name: "mail.classify_priority",
      description: "AI priority scoring for a message",
      parameters: { message_id: { type: "string" } },
      handler: async (params, ctx) => {
        const { prisma } = await import("@n0va/db");
        const msg = await prisma.mailMessage.findFirst({
          where: { id: params.message_id as string, workspaceId: ctx.workspaceId },
        });
        if (!msg) return { success: false, error: "Message not found" };
        const text = `${msg.subject} ${msg.body}`.toLowerCase();
        let priority = "MEDIUM";
        if (text.includes("urgent") || text.includes("asap") || msg.isStarred) priority = "HIGH";
        else if (text.includes("newsletter") || text.includes("unsubscribe")) priority = "LOW";
        return { success: true, data: { priority, messageId: msg.id } };
      },
    },
    {
      name: "mail.apply_label",
      description: "Apply a label to messages",
      parameters: { message_ids: { type: "array" }, label: { type: "string" } },
      handler: async (params, ctx) => {
        const { prisma } = await import("@n0va/db");
        const label = await prisma.mailLabel.findFirst({
          where: { workspaceId: ctx.workspaceId, name: { equals: params.label as string, mode: "insensitive" } },
        });
        if (!label) return { success: false, error: "Label not found" };
        for (const msgId of params.message_ids as string[]) {
          await prisma.mailLabelMap.upsert({
            where: { messageId_labelId: { messageId: msgId, labelId: label.id } },
            create: { messageId: msgId, labelId: label.id, workspaceId: ctx.workspaceId },
            update: {},
          });
        }
        return { success: true, data: { applied: (params.message_ids as string[]).length } };
      },
    },
    {
      name: "mail.move_to_folder",
      description: "Move messages to a folder",
      parameters: { message_ids: { type: "array" }, folder: { type: "string" } },
      handler: async (params, ctx) => {
        const { prisma } = await import("@n0va/db");
        await prisma.mailMessage.updateMany({
          where: { id: { in: params.message_ids as string[] }, workspaceId: ctx.workspaceId },
          data: { folder: params.folder as never },
        });
        return { success: true, data: { moved: (params.message_ids as string[]).length } };
      },
    },
    {
      name: "mail.get_priority_inbox",
      description: "Get AI-priority sorted inbox view",
      parameters: { limit: { type: "number", default: 20 } },
      handler: async (params, ctx) => {
        const { prisma } = await import("@n0va/db");
        const urgent = await prisma.mailMessage.findMany({
          where: { workspaceId: ctx.workspaceId, folder: "INBOX", aiPriority: "HIGH", isRead: false },
          orderBy: { sentAt: "desc" }, take: (params.limit as number) || 20,
        });
        const important = await prisma.mailMessage.findMany({
          where: { workspaceId: ctx.workspaceId, folder: "INBOX", aiPriority: "MEDIUM", isRead: false },
          orderBy: { sentAt: "desc" }, take: (params.limit as number) || 20,
        });
        return { success: true, data: { urgent, important, totalUnread: urgent.length + important.length } };
      },
    },
  ];
}

// ── Agent Workflow Engine ──────────────────────────────────

export class MailAgentWorkflowEngine {
  private workflows: Map<string, AgentWorkflow> = new Map();

  createWorkflow(input: {
    name: string;
    description: string;
    persona: AgentPersona;
    triggers: string[];
    steps: WorkflowStep[];
  }): AgentWorkflow {
    const workflow: AgentWorkflow = {
      id: crypto.randomUUID(),
      name: input.name,
      description: input.description,
      persona: input.persona,
      triggers: input.triggers,
      steps: input.steps,
      status: "active",
    };
    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  getWorkflows(): AgentWorkflow[] {
    return [...this.workflows.values()];
  }

  getWorkflow(id: string): AgentWorkflow | undefined {
    return this.workflows.get(id);
  }

  async executeWorkflow(workflowId: string, context: AgentContext): Promise<{
    success: boolean;
    stepsCompleted: number;
    results: Array<{ step: string; result: AgentToolResult }>;
  }> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return { success: false, stepsCompleted: 0, results: [] };

    const tools = getMailAgentTools();
    const results: Array<{ step: string; result: AgentToolResult }> = [];
    let stepsCompleted = 0;

    for (const step of workflow.steps) {
      const tool = tools.find((t) => t.name === step.action);
      if (!tool) {
        results.push({ step: step.id, result: { success: false, error: `Tool not found: ${step.action}` } });
        if (step.onError === "escalate") break;
        continue;
      }

      try {
        const result = await tool.handler(step.params, context);
        results.push({ step: step.id, result });
        if (result.success) stepsCompleted++;
      } catch (err) {
        results.push({ step: step.id, result: { success: false, error: err instanceof Error ? err.message : "Unknown error" } });
        if (step.onError === "escalate") break;
      }
    }

    return { success: stepsCompleted === workflow.steps.length, stepsCompleted, results };
  }

  // Pre-built workflows from the spec
  createInboundProcessingWorkflow(): AgentWorkflow {
    return this.createWorkflow({
      name: "Inbound Mail Processing",
      description: "Classify, prioritize, and route incoming messages",
      persona: "mail_concierge",
      triggers: ["mail.received"],
      steps: [
        { id: "classify", action: "mail.classify_priority", params: {} },
        { id: "extract", action: "mail.extract_action_items", params: {} },
        { id: "label", action: "mail.apply_label", params: { label: "processed" } },
      ],
    });
  }

  createExecutiveDigestWorkflow(): AgentWorkflow {
    return this.createWorkflow({
      name: "Executive Digest",
      description: "Generate daily priority briefing",
      persona: "executive_brief",
      triggers: ["schedule:daily"],
      steps: [
        { id: "priority", action: "mail.get_priority_inbox", params: { limit: 10 } },
        { id: "summarize", action: "mail.summarize_thread", params: { style: "bullets" } },
      ],
    });
  }
}

// ── Export singleton ──────────────────────────────────────

export const mailAgentWorkflows = new MailAgentWorkflowEngine();
