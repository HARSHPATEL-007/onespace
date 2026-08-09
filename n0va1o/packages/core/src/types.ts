import { z } from 'zod';

// ─── Core Identifiers ────────────────────────────────────────────────────────

export type ResourcePrefix = 'ca_' | 'ac_' | 'sess_' | 'tr_' | 'agent_' | 'rec_';

export interface ResourceId {
  prefix: ResourcePrefix;
  nanoId: string;
}

// ─── Agent Types ─────────────────────────────────────────────────────────────

export const AgentConfigSchema = z.object({
  name: z.string().min(1).max(128),
  type: z.enum(['workflow_orchestrator', 'concierge', 'reply_assistant', 'task_extractor', 'campaign_orchestrator', 'infrastructure_orchestrator', 'custom']),
  description: z.string().max(512).optional(),
  permissions: z.array(z.string()),
  autonomyLevel: z.enum(['low', 'medium', 'high', 'full']),
  approvalRequiredFor: z.array(z.string()).default([]),
  sandboxEnabled: z.boolean().default(true),
  neuralMode: z.boolean().default(false),
  maxDailyActions: z.number().int().positive().default(10000),
  contextWindow: z.number().int().positive().default(128000),
  preferredModel: z.string().default('claude-3-5-sonnet'),
  fallbackModel: z.string().optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export interface Agent {
  agentId: string;
  apiKey: string;
  status: 'active' | 'suspended' | 'revoked';
  config: AgentConfig;
  connectedAccount: string;
  toolsAvailable: string[];
  sessionEndpoint: string;
  createdAt: string;
  expiresAt: string;
}

// ─── Session Types ───────────────────────────────────────────────────────────

export const SessionConfigSchema = z.object({
  agentId: z.string(),
  context: z.object({
    userId: z.string(),
    tenantId: z.string(),
    sessionType: z.enum(['interactive', 'autonomous', 'batch']),
  }),
  tools: z.array(z.string()).optional(),
  sandboxConfig: z.object({
    cpuQuota: z.number().int().max(32).default(2),
    ramQuota: z.number().int().max(131072).default(4096),
    timeoutSeconds: z.number().int().max(7200).default(600),
    networkMode: z.enum(['isolated', 'filtered', 'full']).default('filtered'),
    allowedDomains: z.array(z.string()).optional(),
  }).optional(),
});

export type SessionConfig = z.infer<typeof SessionConfigSchema>;

export interface Session {
  sessionId: string;
  websocketUrl: string;
  sandboxUrl: string;
  expiresAt: string;
  toolsInjected: number;
  contextTokensUsed: number;
  contextTokensRemaining: number;
  state: 'active' | 'paused' | 'suspended' | 'terminated';
}

// ─── Tool Types ──────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  provider: string;
  parameters: Record<string, unknown>;
  requiredScopes: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  estimatedLatencyMs: number;
  deprecated: boolean;
}

export interface ToolDiscoveryResult {
  intent: string;
  confidence: number;
  tools: DiscoveredTool[];
  suggestedWorkflow: string;
  contextTokensSaved: number;
  totalEstimatedLatencyMs: number;
  fallbackTools: string[];
}

export interface DiscoveredTool {
  name: string;
  relevance: number;
  reason: string;
  estimatedLatencyMs: number;
  requiredScopes: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  deprecated: boolean;
}

// ─── Auth Types ──────────────────────────────────────────────────────────────

export interface EncryptedTokens {
  accessToken: Buffer;
  refreshToken: Buffer;
  expiresAt: string;
  scopes: string[];
}

export interface Connection {
  connectionId: string;
  tenantId: string;
  userId: string;
  provider: string;
  authType: 'oauth2.1' | 'oauth2.0' | 'oauth1.0a' | 'saml' | 'oidc' | 'jwt' | 'api_key' | 'aws_sigv4' | 'azure_sas';
  encryptedTokens: EncryptedTokens;
  allowedActions: string[];
  blockedActions: string[];
  jitEnabled: boolean;
  provisionedAt: string;
  autoRefresh: boolean;
  lastUsed: string;
  usageCount: number;
  healthScore: number;
}

// ─── Audit Types ─────────────────────────────────────────────────────────────

export interface AuditEntry {
  auditId: string;
  timestamp: string;
  tenantId: string;
  agentId: string;
  agentName: string;
  agentVersion: string;
  toolName: string;
  toolParameters: Record<string, unknown>;
  sessionId: string;
  workflowId?: string;
  stepNumber: number;
  intentClassification: string;
  confidence: number;
  reasoningChain: string[];
  status: 'success' | 'failure' | 'blocked' | 'pending_approval';
  resultSummary: string;
  latencyMs: number;
  tokensConsumed: number;
  approvalRequired: boolean;
  approvedBy?: string;
  approvalTimestamp?: string;
  ipAddress: string;
  userAgent: string;
  mfaVerified: boolean;
  riskScore: number;
  hash: string;
  merkleRoot?: string;
  blockchainAnchor?: string;
}

// ─── Webhook Types ───────────────────────────────────────────────────────────

export type WebhookEventType =
  | 'n0va1o.connection_established'
  | 'n0va1o.connection_failed'
  | 'n0va1o.recipe_executed'
  | 'n0va1o.agent_action_completed'
  | 'n0va1o.approval_required'
  | 'n0va1o.schema_drift_detected'
  | 'n0va1o.rate_limit_approaching'
  | 'n0va1o.sandbox_execution_complete'
  | 'n0va1o.token_rotated'
  | 'n0va1o.security_alert';

export interface WebhookEvent {
  eventId: string;
  eventType: WebhookEventType;
  timestamp: string;
  tenantId: string;
  payload: Record<string, unknown>;
  signature: string;
}

// ─── Error Types ─────────────────────────────────────────────────────────────

export type N0VA1OErrorCode =
  | 'N0VA1O_RATE_LIMIT'
  | 'N0VA1O_AUTH_EXPIRED'
  | 'N0VA1O_NOT_FOUND'
  | 'N0VA1O_SCHEMA_DRIFT'
  | 'N0VA1O_SANDBOX_ERROR'
  | 'N0VA1O_HITL_REQUIRED'
  | 'N0VA1O_PROVIDER_DOWN'
  | 'N0VA1O_QUOTA_EXCEEDED';

export class N0VA1OError extends Error {
  constructor(
    public code: N0VA1OErrorCode,
    message: string,
    public retryable: boolean = false,
    public retryAfterMs?: number
  ) {
    super(message);
    this.name = 'N0VA1OError';
  }
}

// ─── Transport Types ─────────────────────────────────────────────────────────

export type TransportType = 'stdio' | 'http_sse' | 'websocket';

export interface TransportContext {
  environment: 'local_ide' | 'cloud' | 'hybrid';
  requiresBidirectional: boolean;
  preferredLatency: 'low' | 'medium' | 'high';
}

// ─── Recipe Types ────────────────────────────────────────────────────────────

export interface RecipeDefinition {
  recipeId: string;
  name: string;
  description: string;
  compiledSchema: string;
  executionEndpoint: string;
  estimatedLatencyMs: number;
  requiresApproval: boolean;
  riskScore: number;
  version: string;
  compiledAt: string;
  nextScheduledRun?: string;
  schedule?: RecipeSchedule;
  steps: RecipeStep[];
}

export interface RecipeSchedule {
  type: 'cron' | 'interval' | 'webhook';
  expression: string;
  timezone: string;
}

export interface RecipeStep {
  stepNumber: number;
  tool: string;
  parameters: Record<string, unknown>;
  onError: 'abort' | 'retry' | 'skip' | 'escalate';
  retryCount: number;
}

// ─── HITL Types ──────────────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface HITLRequest {
  requestId: string;
  sessionId: string;
  agentId: string;
  riskLevel: RiskLevel;
  riskScore: number;
  proposedAction: {
    tool: string;
    parameters: Record<string, unknown>;
  };
  reasoning: string[];
  dataAccessed: string[];
  requestedAt: string;
  timeoutAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'modified' | 'escalated' | 'timeout';
  resolvedBy?: string;
  resolvedAt?: string;
  digitalSignature?: string;
  modifiedParameters?: Record<string, unknown>;
}

// ─── Sandbox Types ───────────────────────────────────────────────────────────

export interface SandboxConfig {
  cpuQuota: number;
  ramQuota: number;
  diskQuota: number;
  timeoutSeconds: number;
  networkMode: 'isolated' | 'filtered' | 'full';
  allowedDomains?: string[];
  gpuEnabled: boolean;
}

export interface SandboxExecution {
  executionId: string;
  sessionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
  memoryPeakMb?: number;
  files: string[];
}
