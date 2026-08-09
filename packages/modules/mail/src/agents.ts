/**
 * N0VA MAIL × N0VA1O Agent Integration
 *
 * Exposes mail module capabilities as N0VA1O agent tools.
 * Import `getMailAgentTools` to register mail tools with the N0VA1O gateway.
 */

import { MailService } from "./server";

export interface MailAgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (input: Record<string, unknown>, ctx: { workspaceId: string; userId: string }) => Promise<unknown>;
}

export interface MailAgentContext {
  workspaceId: string;
  userId: string;
}

function makeService(ctx: { workspaceId: string; userId: string }) {
  return new MailService(ctx.workspaceId, ctx.userId, "MEMBER");
}

/**
 * Mail tools available to N0VA1O agents.
 * Each tool exposes a subset of MailService methods with agent-friendly schemas.
 */
export function getMailAgentTools(): MailAgentTool[] {
  return [
    {
      name: "mail.summarize_thread",
      description: "Generate a concise summary of an email thread. Returns 5 bullet points covering decisions, action items, and key context.",
      parameters: {
        type: "object",
        properties: {
          threadId: { type: "string", description: "The thread ID to summarize" },
        },
        required: ["threadId"],
      },
      execute: async (input, ctx) => {
        const svc = makeService(ctx);
        const result = await svc.summarizeThread(String(input.threadId));
        return { summary: result.content, typingDelayMs: result.typingDelayMs };
      },
    },
    {
      name: "mail.suggest_reply",
      description: "Generate a contextually-appropriate reply draft for the latest message in a thread.",
      parameters: {
        type: "object",
        properties: {
          threadId: { type: "string", description: "The thread ID to generate a reply for" },
        },
        required: ["threadId"],
      },
      execute: async (input, ctx) => {
        const svc = makeService(ctx);
        const result = await svc.suggestReply(String(input.threadId));
        return { reply: result.content, typingDelayMs: result.typingDelayMs };
      },
    },
    {
      name: "mail.extract_action_items",
      description: "Extract all action items and to-dos from an email thread as a structured list.",
      parameters: {
        type: "object",
        properties: {
          threadId: { type: "string", description: "The thread ID to extract action items from" },
        },
        required: ["threadId"],
      },
      execute: async (input, ctx) => {
        const svc = makeService(ctx);
        const items = await svc.extractActionItems(String(input.threadId));
        return { actionItems: items };
      },
    },
    {
      name: "mail.adjust_tone",
      description: "Rewrite text in a different tone while preserving meaning.",
      parameters: {
        type: "object",
        properties: {
          threadId: { type: "string", description: "Thread ID for context" },
          content: { type: "string", description: "The text to rewrite" },
          tone: {
            type: "string",
            enum: ["formal", "concise", "friendly", "persuasive"],
            description: "The desired tone",
          },
        },
        required: ["threadId", "content", "tone"],
      },
      execute: async (input, ctx) => {
        const svc = makeService(ctx);
        const result = await svc.adjustTone(
          String(input.threadId),
          String(input.content),
          input.tone as "formal" | "concise" | "friendly" | "persuasive",
        );
        return { rewritten: result.content, typingDelayMs: result.typingDelayMs };
      },
    },
    {
      name: "mail.search",
      description: "Search messages by keyword, folder, sender, or read status.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Keyword to search in subject and body" },
          folder: { type: "string", enum: ["INBOX", "SENT", "ARCHIVE", "TRASH"], description: "Filter by folder" },
          fromEmail: { type: "string", description: "Filter by sender email (exact match)" },
          senderOrRecipient: { type: "string", description: "Search across sender and recipient fields" },
          isRead: { type: "boolean", description: "Filter by read status" },
          isStarred: { type: "boolean", description: "Filter by starred status" },
        },
        required: [],
      },
      execute: async (input, ctx) => {
        const svc = makeService(ctx);
        const results = await svc.search({
          query: input.query as string | undefined,
          folder: input.folder as "INBOX" | "SENT" | "ARCHIVE" | "TRASH" | undefined,
          fromEmail: input.fromEmail as string | undefined,
          senderOrRecipient: input.senderOrRecipient as string | undefined,
          isRead: input.isRead as boolean | undefined,
          isStarred: input.isStarred as boolean | undefined,
        });
        return { count: results.length, results: results.slice(0, 20) };
      },
    },
    {
      name: "mail.list_folder",
      description: "List all threads in a mail folder with metadata.",
      parameters: {
        type: "object",
        properties: {
          folder: {
            type: "string",
            enum: ["INBOX", "SENT", "ARCHIVE", "TRASH"],
            description: "The folder to list",
          },
        },
        required: ["folder"],
      },
      execute: async (input, ctx) => {
        const svc = makeService(ctx);
        const threads = await svc.listFolder(input.folder as "INBOX" | "SENT" | "ARCHIVE" | "TRASH");
        return { count: threads.length, threads };
      },
    },
    {
      name: "mail.get_thread",
      description: "Retrieve all messages in a thread in chronological order.",
      parameters: {
        type: "object",
        properties: {
          threadId: { type: "string", description: "The thread ID to fetch" },
        },
        required: ["threadId"],
      },
      execute: async (input, ctx) => {
        const svc = makeService(ctx);
        const messages = await svc.getThread(String(input.threadId));
        return { messageCount: messages.length, messages };
      },
    },
    {
      name: "mail.save_draft",
      description: "Save a draft message for later sending.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Draft subject" },
          toEmails: { type: "array", items: { type: "string" }, description: "Recipient emails" },
          ccEmails: { type: "array", items: { type: "string" }, description: "CC emails" },
          body: { type: "string", description: "Draft body" },
          threadId: { type: "string", description: "Thread ID if replying" },
        },
        required: ["subject", "toEmails", "body"],
      },
      execute: async (input, ctx) => {
        const svc = makeService(ctx);
        const draft = await svc.saveDraft({
          subject: String(input.subject),
          toEmails: (input.toEmails as string[]) ?? [],
          ccEmails: (input.ccEmails as string[]) ?? [],
          body: String(input.body),
          threadId: input.threadId as string | undefined,
        });
        return { draftId: draft.id, status: "saved" };
      },
    },
    {
      name: "mail.create_rule",
      description: "Create an automation rule for processing incoming/outgoing messages.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Rule name" },
          description: { type: "string", description: "Rule description" },
          enabled: { type: "boolean", description: "Whether the rule is active" },
          priority: { type: "number", description: "Execution priority (lower = higher priority)" },
          conditions: {
            type: "object",
            description: "Condition logic with operator and clauses",
            properties: {
              operator: { type: "string", enum: ["AND", "OR"] },
              conditions: { type: "array", items: { type: "object" } },
            },
          },
          actions: {
            type: "array",
            items: { type: "object" },
            description: "Actions to execute when conditions match",
          },
        },
        required: ["name", "conditions", "actions"],
      },
      execute: async (input, ctx) => {
        const svc = makeService(ctx);
        const rule = await svc.createRule({
          name: String(input.name),
          description: input.description as string | undefined,
          enabled: input.enabled as boolean | undefined,
          priority: input.priority as number | undefined,
          conditions: input.conditions as unknown as any,
          actions: input.actions as unknown as any,
        });
        return { ruleId: rule.id, status: "created" };
      },
    },
    {
      name: "mail.send_message",
      description: "Send an email message. Requires CREATE permission.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Message subject" },
          body: { type: "string", description: "Message body" },
          replyToThreadId: { type: "string", description: "Thread ID to reply to (optional)" },
        },
        required: ["to", "subject", "body"],
      },
      execute: async (input, ctx) => {
        const svc = makeService(ctx);
        const message = await svc.send({
          to: String(input.to),
          subject: String(input.subject),
          body: String(input.body),
          replyToThreadId: input.replyToThreadId as string | undefined,
        });
        return { messageId: message.id, threadId: message.threadId, status: "sent" };
      },
    },
    {
      name: "mail.get_unread_counts",
      description: "Get unread message counts per folder.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
      execute: async (_input, ctx) => {
        const svc = makeService(ctx);
        const counts = await svc.unreadCounts();
        return { counts };
      },
    },
    {
      name: "mail.smart_inbox",
      description: "Get inbox organized by AI priority: urgent, important, newsletters, notifications, other.",
      parameters: { type: "object", properties: {}, required: [] },
      execute: async (_input, ctx) => {
        const svc = makeService(ctx);
        return await svc.getSmartInbox();
      },
    },
    {
      name: "mail.one_click_replies",
      description: "Generate 3 contextual one-click reply options for a thread.",
      parameters: {
        type: "object",
        properties: { threadId: { type: "string", description: "Thread ID" } },
        required: ["threadId"],
      },
      execute: async (input, ctx) => {
        const svc = makeService(ctx);
        return { replies: await svc.oneClickReplies(String(input.threadId)) };
      },
    },
    {
      name: "mail.rewrite_draft",
      description: "Rewrite email draft: adjust tone, fix grammar, shorten. Returns improved text with change list.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Draft text to rewrite" },
          tone: { type: "string", enum: ["formal", "friendly", "assertive", "concise", "empathetic"] },
          fixGrammar: { type: "boolean" },
          shorten: { type: "boolean" },
        },
        required: ["content"],
      },
      execute: async (input, ctx) => {
        const svc = makeService(ctx);
        return await svc.rewriteDraft({
          content: String(input.content),
          tone: input.tone as never,
          fixGrammar: input.fixGrammar as boolean | undefined,
          shorten: input.shorten as boolean | undefined,
        });
      },
    },
    {
      name: "mail.summarize_thread_detailed",
      description: "Generate detailed thread summary with decisions, action items, participants, sentiment.",
      parameters: {
        type: "object",
        properties: { threadId: { type: "string" } },
        required: ["threadId"],
      },
      execute: async (input, ctx) => {
        const svc = makeService(ctx);
        return await svc.summarizeThreadDetailed(String(input.threadId));
      },
    },
    {
      name: "mail.classify_inbox",
      description: "Run AI classification on all unprocessed inbox messages. Returns count of processed messages.",
      parameters: { type: "object", properties: {}, required: [] },
      execute: async (_input, ctx) => {
        const svc = makeService(ctx);
        return await svc.classifyInbox();
      },
    },
  ];
}

/**
 * Dispatch an agent tool call by name.
 */
export async function executeMailAgentTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: MailAgentContext,
): Promise<unknown> {
  const tools = getMailAgentTools();
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) throw new Error(`Unknown mail agent tool: ${toolName}`);
  return tool.execute(input, ctx);
}
