/**
 * N0VA MAIL — Developer API & Extensibility Engine
 *
 * REST/GraphQL endpoints, webhook engine, SMTP relay service,
 * and SDK interfaces.
 */

// ── Types ──────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  workspaceId: string;
  name: string;
  key: string;
  permissions: string[];
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
}

export interface SendEmailRequest {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{ filename: string; content: string; contentType: string }>;
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
  scheduledAt?: string;
}

export interface SendEmailResponse {
  messageId: string;
  status: "queued" | "sent" | "failed";
  recipients: Array<{ email: string; status: string }>;
}

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  workspaceId: string;
  data: Record<string, unknown>;
  timestamp: Date;
  delivered: boolean;
  deliveryAttempts: number;
}

export type WebhookEventType =
  | "email.sent"
  | "email.delivered"
  | "email.deferred"
  | "email.bounced"
  | "email.opened"
  | "email.clicked"
  | "email.complaint"
  | "email.received";

export interface WebhookSubscription {
  id: string;
  workspaceId: string;
  url: string;
  events: WebhookEventType[];
  secret: string;
  isActive: boolean;
  createdAt: Date;
}

export interface SmtpRelayConfig {
  id: string;
  workspaceId: string;
  hostname: string;
  port: number;
  username: string;
  password: string;
  useTls: boolean;
  fromDomain: string;
  createdAt: Date;
}

// ── REST API Endpoints ────────────────────────────────────

export interface RestEndpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  description: string;
  auth: "api_key" | "oauth" | "none";
  handler: (req: unknown) => Promise<unknown>;
}

export const restEndpoints: RestEndpoint[] = [
  { method: "POST", path: "/v1/email/send", description: "Send an email", auth: "api_key", handler: async () => ({}) },
  { method: "GET", path: "/v1/messages/:id", description: "Get message by ID", auth: "api_key", handler: async () => ({}) },
  { method: "GET", path: "/v1/threads", description: "List threads", auth: "api_key", handler: async () => ({}) },
  { method: "PATCH", path: "/v1/labels", description: "Update labels", auth: "api_key", handler: async () => ({}) },
  { method: "GET", path: "/v1/messages/:id/body", description: "Get message body", auth: "api_key", handler: async () => ({}) },
  { method: "POST", path: "/v1/messages/:id/forward", description: "Forward message", auth: "api_key", handler: async () => ({}) },
  { method: "DELETE", path: "/v1/messages/:id", description: "Delete message", auth: "api_key", handler: async () => ({}) },
  { method: "GET", path: "/v1/folders", description: "List folders", auth: "api_key", handler: async () => ({}) },
  { method: "POST", path: "/v1/attachments/upload", description: "Upload attachment", auth: "api_key", handler: async () => ({}) },
  { method: "GET", path: "/v1/search", description: "Search messages", auth: "api_key", handler: async () => ({}) },
];

// ── GraphQL Schema ────────────────────────────────────────

export const graphqlSchema = `
type Query {
  message(id: ID!): Message
  threads(folder: String, limit: Int, offset: Int): [Thread!]!
  search(query: String!, filters: SearchFilters): SearchResult!
  folders: [Folder!]!
}

type Mutation {
  sendEmail(input: SendEmailInput!): SendResult!
  deleteMessage(id: ID!): Boolean!
  applyLabels(messageIds: [ID!]!, labelIds: [ID!]!): Boolean!
  createFolder(name: ID!): Folder!
  markRead(messageIds: [ID!]!, read: Boolean!): Boolean!
}

type Subscription {
  emailReceived: EmailEvent!
  emailSent: EmailEvent!
}

input SendEmailInput {
  from: String!
  to: [String!]!
  cc: [String!]
  bcc: [String!]
  subject: String!
  text: String
  html: String
  attachments: [AttachmentInput!]
  replyTo: String
  scheduledAt: String
}

input AttachmentInput {
  filename: String!
  content: String!
  contentType: String!
}

input SearchFilters {
  from: String
  to: String
  subject: String
  hasAttachment: Boolean
  after: String
  before: String
}

type Message {
  id: ID!
  threadId: ID!
  from: EmailAddress!
  to: [EmailAddress!]!
  subject: String!
  body: String!
  date: String!
  isRead: Boolean!
  labels: [Label!]!
  attachments: [Attachment!]!
}

type EmailAddress {
  name: String
  email: String!
}

type Thread {
  id: ID!
  subject: String!
  messages: [Message!]!
  participants: [EmailAddress!]!
  lastMessageAt: String!
}

type Label {
  id: ID!
  name: String!
  color: String!
}

type Attachment {
  id: ID!
  filename: String!
  contentType: String!
  sizeBytes: Int!
  url: String!
}

type Folder {
  id: ID!
  name: String!
  unreadCount: Int!
  totalCount: Int!
}

type SearchResult {
  messages: [Message!]!
  total: Int!
  facets: SearchFacets!
}

type SearchFacets {
  senders: [FacetCount!]!
  folders: [FacetCount!]!
  dates: [FacetCount!]!
}

type FacetCount {
  value: String!
  count: Int!
}

type SendResult {
  messageId: ID!
  status: String!
  recipients: [RecipientResult!]!
}

type RecipientResult {
  email: String!
  status: String!
}

type EmailEvent {
  id: ID!
  type: String!
  timestamp: String!
  data: String!
}
`;

// ── Webhook Engine ────────────────────────────────────────

export class WebhookEngine {
  private subscriptions: Map<string, WebhookSubscription> = new Map();
  private eventQueue: WebhookEvent[] = [];

  subscribe(sub: WebhookSubscription): void {
    this.subscriptions.set(sub.id, sub);
  }

  unsubscribe(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId);
  }

  async emit(event: Omit<WebhookEvent, "id" | "delivered" | "deliveryAttempts" | "timestamp"> & { timestamp?: Date }): Promise<void> {
    const fullEvent: WebhookEvent = {
      ...event,
      id: crypto.randomUUID(),
      delivered: false,
      deliveryAttempts: 0,
      timestamp: event.timestamp || new Date(),
    };
    this.eventQueue.push(fullEvent);
    await this.processQueue();
  }

  private async processQueue(): Promise<void> {
    for (const event of this.eventQueue) {
      if (event.delivered) continue;

      for (const sub of this.subscriptions.values()) {
        if (!sub.isActive) continue;
        if (!sub.events.includes(event.type)) continue;

        try {
          await this.deliverWebhook(sub, event);
          event.delivered = true;
        } catch {
          event.deliveryAttempts++;
        }
      }
    }
  }

  private async deliverWebhook(sub: WebhookSubscription, event: WebhookEvent): Promise<void> {
    const signature = await this.signPayload(JSON.stringify(event.data), sub.secret);
    await fetch(sub.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-n0va-signature": signature,
        "x-n0va-event": event.type,
      },
      body: JSON.stringify(event),
    });
  }

  private async signPayload(payload: string, secret: string): Promise<string> {
    const crypto = await import("crypto");
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
  }

  getSubscriptions(workspaceId: string): WebhookSubscription[] {
    return [...this.subscriptions.values()].filter(s => s.workspaceId === workspaceId);
  }
}

// ── SMTP Relay Service ────────────────────────────────────

export class SmtpRelayService {
  private configs: Map<string, SmtpRelayConfig> = new Map();

  createConfig(config: SmtpRelayConfig): void {
    this.configs.set(config.id, config);
  }

  getConfig(id: string): SmtpRelayConfig | undefined {
    return this.configs.get(id);
  }

  listConfigs(workspaceId: string): SmtpRelayConfig[] {
    return [...this.configs.values()].filter(c => c.workspaceId === workspaceId);
  }

  async sendViaRelay(configId: string, message: { to: string[]; subject: string; text?: string; html?: string }): Promise<{ success: boolean; error?: string }> {
    const config = this.configs.get(configId);
    if (!config) return { success: false, error: "Config not found" };

    // In production: connect to SMTP server, authenticate, send
    return { success: true };
  }
}

// ── API Key Manager ───────────────────────────────────────

export class ApiKeyManager {
  private keys: Map<string, ApiKey> = new Map();

  createKey(workspaceId: string, name: string, permissions: string[]): ApiKey {
    const key: ApiKey = {
      id: crypto.randomUUID(),
      workspaceId,
      name,
      key: `n0va_${crypto.randomUUID().replace(/-/g, "")}`,
      permissions,
      createdAt: new Date(),
    };
    this.keys.set(key.id, key);
    return key;
  }

  validateKey(key: string): ApiKey | null {
    for (const k of this.keys.values()) {
      if (k.key === key && (!k.expiresAt || k.expiresAt > new Date())) {
        return k;
      }
    }
    return null;
  }

  revokeKey(keyId: string): void {
    this.keys.delete(keyId);
  }

  listKeys(workspaceId: string): ApiKey[] {
    return [...this.keys.values()].filter(k => k.workspaceId === workspaceId);
  }
}
