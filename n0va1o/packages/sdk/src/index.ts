import {
  N0VA1OGateway,
  AgentConfig,
  Agent,
  Session,
  SessionConfig,
  ToolDiscoveryResult,
  Connection,
  SandboxConfig,
  SandboxExecution,
  HITLRequest,
  AuditEntry,
  WebhookEventType,
  WebhookEvent,
  ToolDefinition,
} from '@n0va1o/core';

// ─── N0VA1O Client ───────────────────────────────────────────────────────────

export interface N0VA1OClientConfig {
  apiKey: string;
  tenantId: string;
  endpoint: string;
  transport: 'stdio' | 'http_sse' | 'websocket';
  timeout?: number;
}

export class N0VA1OClient {
  private apiKey: string;
  private tenantId: string;
  private endpoint: string;
  private transport: string;
  private timeout: number;

  constructor(config: N0VA1OClientConfig) {
    this.apiKey = config.apiKey;
    this.tenantId = config.tenantId;
    this.endpoint = config.endpoint;
    this.transport = config.transport;
    this.timeout = config.timeout ?? 30000;
  }

  // ─── Agent Operations ───────────────────────────────────────────────────

  async registerAgent(config: AgentConfig): Promise<Agent> {
    return N0VA1OGateway.registerAgent(this.apiKey, config);
  }

  getAgent(agentId: string): Agent | undefined {
    return N0VA1OGateway.getAgent(agentId);
  }

  // ─── Session Operations ─────────────────────────────────────────────────

  async createSession(config: SessionConfig): Promise<Session> {
    return N0VA1OGateway.createSession(config);
  }

  getSession(sessionId: string): Session | undefined {
    return N0VA1OGateway.getSession(sessionId);
  }

  setSessionState(sessionId: string, state: 'active' | 'paused' | 'suspended' | 'terminated'): void {
    N0VA1OGateway.setSessionState(sessionId, state);
  }

  // ─── Tool Operations ────────────────────────────────────────────────────

  async discoverTools(query: string, agentId: string, maxTools?: number): Promise<ToolDiscoveryResult> {
    return N0VA1OGateway.discoverTools(query, agentId, maxTools);
  }

  listTools(): ToolDefinition[] {
    return N0VA1OGateway.listTools();
  }

  // ─── Connection Operations ──────────────────────────────────────────────

  async createConnection(
    userId: string,
    provider: string,
    authType: Connection['authType'],
    scopes?: string[]
  ): Promise<Connection> {
    return N0VA1OGateway.createConnection(this.tenantId, userId, provider, authType, scopes);
  }

  getConnection(connectionId: string): Connection | undefined {
    return N0VA1OGateway.getConnection(connectionId);
  }

  // ─── Sandbox Operations ─────────────────────────────────────────────────

  async executeInSandbox(
    sessionId: string,
    code: string,
    language: 'python' | 'bash' = 'python',
    config?: Partial<SandboxConfig>
  ): Promise<SandboxExecution> {
    return N0VA1OGateway.executeInSandbox(sessionId, code, language, config);
  }

  getSandboxExecution(executionId: string): SandboxExecution | undefined {
    return N0VA1OGateway.getSandboxExecution(executionId);
  }

  // ─── HITL Operations ────────────────────────────────────────────────────

  getHITLRequest(requestId: string): HITLRequest | undefined {
    return N0VA1OGateway.getHITLRequest(requestId);
  }

  resolveHITLRequest(
    requestId: string,
    resolution: 'approved' | 'rejected' | 'modified',
    resolvedBy: string,
    modifiedParameters?: Record<string, unknown>
  ): HITLRequest {
    return N0VA1OGateway.resolveHITLRequest(requestId, resolution, resolvedBy, modifiedParameters);
  }

  // ─── Audit Operations ───────────────────────────────────────────────────

  getAuditLog(filters?: { agentId?: string; sessionId?: string }): AuditEntry[] {
    return N0VA1OGateway.getAuditLog({ ...filters, tenantId: this.tenantId });
  }

  // ─── Webhook Operations ─────────────────────────────────────────────────

  onWebhookEvent(eventType: WebhookEventType, handler: (event: WebhookEvent) => void): void {
    N0VA1OGateway.registerWebhookHandler(eventType, handler);
  }

  async emitWebhook(eventType: WebhookEventType, payload: Record<string, unknown>): Promise<void> {
    return N0VA1OGateway.emitWebhook(eventType, this.tenantId, payload);
  }

  // ─── Utility ────────────────────────────────────────────────────────────

  getConfig(): N0VA1OClientConfig {
    return {
      apiKey: this.apiKey,
      tenantId: this.tenantId,
      endpoint: this.endpoint,
      transport: this.transport as 'stdio' | 'http_sse' | 'websocket',
      timeout: this.timeout,
    };
  }
}

// ─── Convenience exports ─────────────────────────────────────────────────────

export function createClient(config: N0VA1OClientConfig): N0VA1OClient {
  return new N0VA1OClient(config);
}

export * from '@n0va1o/core';
