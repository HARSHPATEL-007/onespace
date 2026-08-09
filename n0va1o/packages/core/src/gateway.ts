import { randomUUID } from 'crypto';
import { z } from 'zod';
import {
  Agent,
  AgentConfig,
  AuditEntry,
  Connection,
  DiscoveredTool,
  HITLRequest,
  N0VA1OError,
  RiskLevel,
  SandboxConfig,
  SandboxExecution,
  Session,
  SessionConfig,
  ToolDefinition,
  ToolDiscoveryResult,
  TransportContext,
  TransportType,
  WebhookEvent,
  WebhookEventType,
} from './types';

// ─── In-Memory Stores (replace with DB in production) ───────────────────────

const agents = new Map<string, Agent>();
const sessions = new Map<string, Session>();
const connections = new Map<string, Connection>();
const tools = new Map<string, ToolDefinition>();
const auditLog: AuditEntry[] = [];
const hitlRequests = new Map<string, HITLRequest>();
const sandboxExecutions = new Map<string, SandboxExecution>();
const webhookHandlers = new Map<WebhookEventType, Set<(e: WebhookEvent) => void>>();

// ─── Tool Registry ───────────────────────────────────────────────────────────

export function registerTool(tool: ToolDefinition): void {
  tools.set(tool.name, tool);
}

export function getTool(name: string): ToolDefinition | undefined {
  return tools.get(name);
}

export function listTools(): ToolDefinition[] {
  return Array.from(tools.values());
}

// ─── Agent Management ────────────────────────────────────────────────────────

export async function registerAgent(
  tenantToken: string,
  config: AgentConfig
): Promise<Agent> {
  const agentId = `agent_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const apiKey = `n0va_sk_${randomUUID().replace(/-/g, '')}`;
  const connectedAccount = `ca_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

  const agent: Agent = {
    agentId,
    apiKey,
    status: 'active',
    config,
    connectedAccount,
    toolsAvailable: resolveAvailableTools(config),
    sessionEndpoint: `wss://n0va1o.io/sessions/${agentId}`,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  };

  agents.set(agentId, agent);
  return agent;
}

export function getAgent(agentId: string): Agent | undefined {
  return agents.get(agentId);
}

function resolveAvailableTools(config: AgentConfig): string[] {
  return Array.from(tools.values())
    .filter(tool => {
      if (tool.riskLevel === 'critical' && config.autonomyLevel !== 'full') return false;
      if (tool.riskLevel === 'high' && config.autonomyLevel === 'low') return false;
      return true;
    })
    .map(t => t.name);
}

// ─── Session Management ──────────────────────────────────────────────────────

export async function createSession(config: SessionConfig): Promise<Session> {
  const agent = agents.get(config.agentId);
  if (!agent) throw new N0VA1OError('N0VA1O_NOT_FOUND', 'Agent not found');

  const sessionId = `sess_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const toolsToInject = config.tools
    ? config.tools.filter(t => agent.toolsAvailable.includes(t))
    : agent.toolsAvailable.slice(0, 10);

  const session: Session = {
    sessionId,
    websocketUrl: `wss://n0va1o.io/sessions/${sessionId}`,
    sandboxUrl: `https://sandbox.n0va1o.io/sessions/${sessionId}`,
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    toolsInjected: toolsToInject.length,
    contextTokensUsed: toolsToInject.length * 350,
    contextTokensRemaining: agent.config.contextWindow - toolsToInject.length * 350,
    state: 'active',
  };

  sessions.set(sessionId, session);
  return session;
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export function setSessionState(sessionId: string, state: Session['state']): void {
  const session = sessions.get(sessionId);
  if (session) session.state = state;
}

// ─── Intent-Based Tool Discovery ─────────────────────────────────────────────

export async function discoverTools(
  query: string,
  agentId: string,
  maxTools: number = 5
): Promise<ToolDiscoveryResult> {
  const agent = agents.get(agentId);
  if (!agent) throw new N0VA1OError('N0VA1O_NOT_FOUND', 'Agent not found');

  const queryLower = query.toLowerCase();
  const scored: DiscoveredTool[] = [];

  for (const tool of tools.values()) {
    if (!agent.toolsAvailable.includes(tool.name)) continue;
    if (tool.deprecated) continue;

    let relevance = 0;
    const queryTerms = queryLower.split(/\s+/);

    for (const term of queryTerms) {
      if (tool.name.toLowerCase().includes(term)) relevance += 0.3;
      if (tool.description.toLowerCase().includes(term)) relevance += 0.2;
      if (tool.provider.toLowerCase().includes(term)) relevance += 0.15;
    }

    // Intent matching heuristics
    if (queryLower.includes('find') || queryLower.includes('search')) {
      if (tool.name.includes('search') || tool.name.includes('list') || tool.name.includes('read')) relevance += 0.25;
    }
    if (queryLower.includes('create') || queryLower.includes('upload') || queryLower.includes('send')) {
      if (tool.name.includes('create') || tool.name.includes('upload') || tool.name.includes('post') || tool.name.includes('send')) relevance += 0.25;
    }
    if (queryLower.includes('convert') || queryLower.includes('transform')) {
      if (tool.name.includes('convert') || tool.name.includes('transform')) relevance += 0.3;
    }
    if (queryLower.includes('notify') || queryLower.includes('message')) {
      if (tool.name.includes('post') || tool.name.includes('send') || tool.name.includes('notify')) relevance += 0.25;
    }

    if (relevance > 0) {
      scored.push({
        name: tool.name,
        relevance: Math.min(relevance, 1.0),
        reason: `Matches intent: "${query}"`,
        estimatedLatencyMs: tool.estimatedLatencyMs,
        requiredScopes: tool.requiredScopes,
        riskLevel: tool.riskLevel,
        deprecated: tool.deprecated,
      });
    }
  }

  scored.sort((a, b) => b.relevance - a.relevance);

  const selected = scored.slice(0, maxTools);
  const intent = classifyIntent(query);
  const totalLatency = selected.reduce((sum, t) => sum + t.estimatedLatencyMs, 0);
  const tokensSaved = (agent.toolsAvailable.length - selected.length) * 350;

  return {
    intent: intent.name,
    confidence: intent.confidence,
    tools: selected,
    suggestedWorkflow: selected.map(t => t.name.split('.')[1] || t.name).join(' -> '),
    contextTokensSaved: tokensSaved,
    totalEstimatedLatencyMs: totalLatency,
    fallbackTools: scored.slice(maxTools, maxTools + 3).map(t => t.name),
  };
}

function classifyIntent(query: string): { name: string; confidence: number } {
  const q = query.toLowerCase();
  if (q.includes('invoice') || q.includes('report') || q.includes('sync')) {
    return { name: 'data_sync_workflow', confidence: 0.95 };
  }
  if (q.includes('campaign') || q.includes('ad') || q.includes('marketing')) {
    return { name: 'marketing_automation', confidence: 0.92 };
  }
  if (q.includes('lead') || q.includes('crm') || q.includes('customer')) {
    return { name: 'crm_workflow', confidence: 0.90 };
  }
  if (q.includes('deploy') || q.includes('ci') || q.includes('build')) {
    return { name: 'devops_pipeline', confidence: 0.88 };
  }
  return { name: 'general_automation', confidence: 0.75 };
}

// ─── Connection Management ───────────────────────────────────────────────────

export async function createConnection(
  tenantId: string,
  userId: string,
  provider: string,
  authType: Connection['authType'],
  scopes: string[] = []
): Promise<Connection> {
  const connectionId = `ca_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

  const connection: Connection = {
    connectionId,
    tenantId,
    userId,
    provider,
    authType,
    encryptedTokens: {
      accessToken: Buffer.from(`encrypted_${randomUUID()}`),
      refreshToken: Buffer.from(`encrypted_${randomUUID()}`),
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      scopes,
    },
    allowedActions: [],
    blockedActions: ['delete_account', 'modify_billing', 'delete_organization'],
    jitEnabled: true,
    provisionedAt: new Date().toISOString(),
    autoRefresh: true,
    lastUsed: new Date().toISOString(),
    usageCount: 0,
    healthScore: 1.0,
  };

  connections.set(connectionId, connection);
  return connection;
}

export function getConnection(connectionId: string): Connection | undefined {
  return connections.get(connectionId);
}

// ─── Transport Selection ─────────────────────────────────────────────────────

export function selectTransport(context: TransportContext): TransportType {
  if (context.environment === 'local_ide') return 'stdio';
  if (context.requiresBidirectional) return 'websocket';
  return 'http_sse';
}

// ─── Audit Logging ───────────────────────────────────────────────────────────

export function logAction(entry: Omit<AuditEntry, 'auditId' | 'timestamp' | 'hash'>): AuditEntry {
  const auditId = `audit_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const timestamp = new Date().toISOString();
  const hash = computeHash({ ...entry, auditId, timestamp });

  const fullEntry: AuditEntry = { ...entry, auditId, timestamp, hash };
  auditLog.push(fullEntry);
  return fullEntry;
}

export function getAuditLog(filters?: { agentId?: string; sessionId?: string; tenantId?: string }): AuditEntry[] {
  let results = auditLog;
  if (filters?.agentId) results = results.filter(e => e.agentId === filters.agentId);
  if (filters?.sessionId) results = results.filter(e => e.sessionId === filters.sessionId);
  if (filters?.tenantId) results = results.filter(e => e.tenantId === filters.tenantId);
  return results;
}

function computeHash(data: Record<string, unknown>): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `sha256:${Math.abs(hash).toString(16).padStart(16, '0')}`;
}

// ─── Webhook System ──────────────────────────────────────────────────────────

export function registerWebhookHandler(
  eventType: WebhookEventType,
  handler: (event: WebhookEvent) => void
): void {
  if (!webhookHandlers.has(eventType)) {
    webhookHandlers.set(eventType, new Set());
  }
  webhookHandlers.get(eventType)!.add(handler);
}

export async function emitWebhook(eventType: WebhookEventType, tenantId: string, payload: Record<string, unknown>): Promise<void> {
  const event: WebhookEvent = {
    eventId: `evt_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    eventType,
    timestamp: new Date().toISOString(),
    tenantId,
    payload,
    signature: `sig_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
  };

  const handlers = webhookHandlers.get(eventType);
  if (handlers) {
    for (const handler of handlers) {
      handler(event);
    }
  }
}

// ─── HITL System ─────────────────────────────────────────────────────────────

export function assessRisk(tool: string, parameters: Record<string, unknown>): { level: RiskLevel; score: number } {
  const toolDef = tools.get(tool);
  if (!toolDef) return { level: 'medium', score: 0.5 };

  let score = 0;

  if (toolDef.riskLevel === 'critical') score += 0.4;
  else if (toolDef.riskLevel === 'high') score += 0.25;
  else if (toolDef.riskLevel === 'medium') score += 0.1;

  const paramStr = JSON.stringify(parameters).toLowerCase();
  if (paramStr.includes('delete') || paramStr.includes('remove')) score += 0.3;
  if (paramStr.includes('transfer') || paramStr.includes('payment')) score += 0.25;
  if (paramStr.includes('all') || paramStr.includes('bulk')) score += 0.15;

  score = Math.min(score, 1.0);

  if (score >= 0.8) return { level: 'critical', score };
  if (score >= 0.5) return { level: 'high', score };
  if (score >= 0.2) return { level: 'medium', score };
  return { level: 'low', score };
}

export function createHITLRequest(
  sessionId: string,
  agentId: string,
  proposedAction: HITLRequest['proposedAction'],
  reasoning: string[],
  dataAccessed: string[]
): HITLRequest {
  const { level, score } = assessRisk(proposedAction.tool, proposedAction.parameters);
  const now = Date.now();

  const timeoutMs = level === 'critical' ? 4 * 3600 * 1000 : 24 * 3600 * 1000;

  const request: HITLRequest = {
    requestId: `hitl_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    sessionId,
    agentId,
    riskLevel: level,
    riskScore: score,
    proposedAction,
    reasoning,
    dataAccessed,
    requestedAt: new Date(now).toISOString(),
    timeoutAt: new Date(now + timeoutMs).toISOString(),
    status: 'pending',
  };

  hitlRequests.set(request.requestId, request);
  return request;
}

export function resolveHITLRequest(
  requestId: string,
  resolution: 'approved' | 'rejected' | 'modified',
  resolvedBy: string,
  modifiedParameters?: Record<string, unknown>
): HITLRequest {
  const request = hitlRequests.get(requestId);
  if (!request) throw new N0VA1OError('N0VA1O_NOT_FOUND', 'HITL request not found');

  request.status = resolution === 'approved' ? 'approved' :
                   resolution === 'rejected' ? 'rejected' : 'modified';
  request.resolvedBy = resolvedBy;
  request.resolvedAt = new Date().toISOString();
  request.digitalSignature = `sig_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  if (modifiedParameters) request.modifiedParameters = modifiedParameters;

  return request;
}

export function getHITLRequest(requestId: string): HITLRequest | undefined {
  return hitlRequests.get(requestId);
}

// ─── Sandbox Execution ──────────────────────────────────────────────────────

export async function executeInSandbox(
  sessionId: string,
  code: string,
  language: 'python' | 'bash' = 'python',
  config?: Partial<SandboxConfig>
): Promise<SandboxExecution> {
  const executionId = `exec_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

  const execution: SandboxExecution = {
    executionId,
    sessionId,
    status: 'pending',
    files: [],
  };

  sandboxExecutions.set(executionId, execution);

  // Simulate sandbox execution
  execution.status = 'running';

  try {
    // In production: provision MicroVM, inject code, stream results
    await new Promise(resolve => setTimeout(resolve, 100));

    execution.status = 'completed';
    execution.exitCode = 0;
    execution.stdout = `Executed ${language} code successfully\nCode length: ${code.length} chars`;
    execution.stderr = '';
    execution.durationMs = 100;
    execution.memoryPeakMb = 64;
  } catch {
    execution.status = 'failed';
    execution.exitCode = 1;
    execution.stderr = 'Execution failed';
  }

  return execution;
}

export function getSandboxExecution(executionId: string): SandboxExecution | undefined {
  return sandboxExecutions.get(executionId);
}

// ─── Schema Modifiers ────────────────────────────────────────────────────────

export function applySchemaModifiers(
  toolDef: ToolDefinition,
  agentConfig: AgentConfig
): ToolDefinition {
  const modified = { ...toolDef };

  // Field redaction based on autonomy level
  if (agentConfig.autonomyLevel !== 'full') {
    modified.parameters = redactDangerousFields(modified.parameters);
  }

  // Value capping
  modified.parameters = capNumericalValues(modified.parameters);

  return modified;
}

function redactDangerousFields(params: Record<string, unknown>): Record<string, unknown> {
  const dangerous = ['delete', 'remove', 'destroy', 'purge', 'drop', 'truncate'];
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (dangerous.some(d => key.toLowerCase().includes(d))) {
      continue;
    }
    result[key] = value;
  }

  return result;
}

function capNumericalValues(params: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'number' && key.toLowerCase().includes('budget')) {
      result[key] = Math.min(value, 50000);
    } else {
      result[key] = value;
    }
  }

  return result;
}

// ─── Export Gateway API ──────────────────────────────────────────────────────

export const N0VA1OGateway = {
  // Agent
  registerAgent,
  getAgent,
  // Session
  createSession,
  getSession,
  setSessionState,
  // Tools
  registerTool,
  getTool,
  listTools,
  discoverTools,
  applySchemaModifiers,
  // Connections
  createConnection,
  getConnection,
  // Transport
  selectTransport,
  // Audit
  logAction,
  getAuditLog,
  // Webhooks
  registerWebhookHandler,
  emitWebhook,
  // HITL
  assessRisk,
  createHITLRequest,
  resolveHITLRequest,
  getHITLRequest,
  // Sandbox
  executeInSandbox,
  getSandboxExecution,
};
