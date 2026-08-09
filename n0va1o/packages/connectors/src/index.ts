import { N0VA1OGateway, ToolDefinition } from '@n0va1o/core';

// ─── Connector Framework ─────────────────────────────────────────────────────

export interface ConnectorConfig {
  provider: string;
  displayName: string;
  authType: 'oauth2.1' | 'oauth2.0' | 'oauth1.0a' | 'api_key' | 'jwt' | 'aws_sigv4';
  scopes: string[];
  baseUrl: string;
  docsUrl: string;
  iconUrl?: string;
}

export interface OAuthState {
  state: string;
  redirectUri: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string;
}

export interface WebhookSubscription {
  id: string;
  provider: string;
  eventTypes: string[];
  callbackUrl: string;
  secret: string;
  active: boolean;
}

export abstract class BaseConnector {
  protected config: ConnectorConfig;
  protected oauthStates = new Map<string, OAuthState>();
  protected webhookSubscriptions = new Map<string, WebhookSubscription>();

  constructor(config: ConnectorConfig) {
    this.config = config;
  }

  abstract getTools(): ToolDefinition[];
  abstract authenticate(credentials: Record<string, unknown>): Promise<{ success: boolean; connectionId?: string }>;
  abstract execute(tool: string, parameters: Record<string, unknown>): Promise<Record<string, unknown>>;
  abstract refresh(connectionId: string): Promise<boolean>;

  getProvider(): string {
    return this.config.provider;
  }

  getDisplayName(): string {
    return this.config.displayName;
  }

  initiateOAuth(scopes: string[], redirectUri: string): { authUrl: string; state: string } {
    const state = `oauth_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    this.oauthStates.set(state, {
      state,
      redirectUri,
      scopes,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600 * 1000).toISOString(),
    });

    const authUrl = `${this.config.baseUrl}/oauth/authorize?` +
      `client_id={CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scopes.join(' '))}` +
      `&state=${state}` +
      `&response_type=code`;

    return { authUrl, state };
  }

  completeOAuth(state: string, code: string): { success: string; scopes: string[] } {
    const oauthState = this.oauthStates.get(state);
    if (!oauthState) throw new Error('Invalid OAuth state');

    this.oauthStates.delete(state);
    return { success: 'connected', scopes: oauthState.scopes };
  }

  subscribeWebhook(eventTypes: string[], callbackUrl: string): WebhookSubscription {
    const sub: WebhookSubscription = {
      id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      provider: this.config.provider,
      eventTypes,
      callbackUrl,
      secret: `whsec_${Math.random().toString(36).slice(2, 16)}`,
      active: true,
    };

    this.webhookSubscriptions.set(sub.id, sub);
    return sub;
  }

  unsubscribeWebhook(subscriptionId: string): boolean {
    return this.webhookSubscriptions.delete(subscriptionId);
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const expected = computeHmac(payload, secret);
    return signature === expected;
  }
}

function computeHmac(payload: string, secret: string): string {
  let hash = 0;
  const combined = payload + secret;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `hmac_${Math.abs(hash).toString(16)}`;
}

// ─── Google Drive Connector ──────────────────────────────────────────────────

export class GoogleDriveConnector extends BaseConnector {
  constructor() {
    super({
      provider: 'google_drive',
      displayName: 'Google Drive',
      authType: 'oauth2.0',
      scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file'],
      baseUrl: 'https://www.googleapis.com/drive/v3',
      docsUrl: 'https://developers.google.com/drive',
    });
  }

  getTools(): ToolDefinition[] {
    return [
      {
        name: 'google_drive.search_files',
        description: 'Search for files in Google Drive by name, type, or metadata',
        provider: 'google_drive',
        parameters: {
          query: { type: 'string', description: 'Search query (e.g., "name contains \'invoice\'")' },
          pageSize: { type: 'number', description: 'Max results (1-1000)', default: 10 },
          fields: { type: 'string', description: 'Fields to return' },
        },
        requiredScopes: ['drive.readonly'],
        riskLevel: 'low',
        estimatedLatencyMs: 450,
        deprecated: false,
      },
      {
        name: 'google_drive.read_file',
        description: 'Read file content from Google Drive by file ID',
        provider: 'google_drive',
        parameters: {
          fileId: { type: 'string', description: 'Google Drive file ID' },
          mimeType: { type: 'string', description: 'Export MIME type for Google Docs' },
        },
        requiredScopes: ['drive.readonly'],
        riskLevel: 'low',
        estimatedLatencyMs: 300,
        deprecated: false,
      },
      {
        name: 'google_drive.upload_file',
        description: 'Upload a file to Google Drive',
        provider: 'google_drive',
        parameters: {
          name: { type: 'string', description: 'File name' },
          content: { type: 'string', description: 'File content (base64)' },
          mimeType: { type: 'string', description: 'MIME type' },
          parents: { type: 'array', description: 'Parent folder IDs' },
        },
        requiredScopes: ['drive.file'],
        riskLevel: 'medium',
        estimatedLatencyMs: 800,
        deprecated: false,
      },
      {
        name: 'google_drive.list_folder',
        description: 'List files in a Google Drive folder',
        provider: 'google_drive',
        parameters: {
          folderId: { type: 'string', description: 'Folder ID (root for My Drive)' },
          pageSize: { type: 'number', description: 'Max results', default: 50 },
        },
        requiredScopes: ['drive.readonly'],
        riskLevel: 'low',
        estimatedLatencyMs: 350,
        deprecated: false,
      },
    ];
  }

  async authenticate(credentials: Record<string, unknown>): Promise<{ success: boolean; connectionId?: string }> {
    const { accessToken, refreshToken } = credentials;
    if (!accessToken) return { success: false };

    const connection = await N0VA1OGateway.createConnection(
      'tenant_001',
      'user_001',
      'google_drive',
      'oauth2.0',
      this.config.scopes
    );

    return { success: true, connectionId: connection.connectionId };
  }

  async execute(tool: string, parameters: Record<string, unknown>): Promise<Record<string, unknown>> {
    switch (tool) {
      case 'google_drive.search_files':
        return this.searchFiles(parameters as { query: string; pageSize?: number });
      case 'google_drive.read_file':
        return this.readFile(parameters as { fileId: string });
      case 'google_drive.upload_file':
        return this.uploadFile(parameters as { name: string; content: string; mimeType: string });
      case 'google_drive.list_folder':
        return this.listFolder(parameters as { folderId: string; pageSize?: number });
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  }

  async refresh(connectionId: string): Promise<boolean> {
    const conn = N0VA1OGateway.getConnection(connectionId);
    if (!conn) return false;
    conn.encryptedTokens.expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    return true;
  }

  private async searchFiles(params: { query: string; pageSize?: number }): Promise<Record<string, unknown>> {
    return {
      files: [
        { id: 'file_001', name: 'Q3_Invoice_2026.pdf', mimeType: 'application/pdf', size: 245000 },
        { id: 'file_002', name: 'Q3_Report.xlsx', mimeType: 'application/vnd.google-apps.spreadsheet', size: 128000 },
      ],
      totalResults: 2,
      query: params.query,
    };
  }

  private async readFile(params: { fileId: string }): Promise<Record<string, unknown>> {
    return {
      fileId: params.fileId,
      content: 'base64_encoded_content...',
      mimeType: 'application/pdf',
      size: 245000,
    };
  }

  private async uploadFile(params: { name: string; content: string; mimeType: string }): Promise<Record<string, unknown>> {
    return {
      fileId: `file_${Date.now()}`,
      name: params.name,
      mimeType: params.mimeType,
      webViewLink: `https://drive.google.com/file/d/file_${Date.now()}`,
    };
  }

  private async listFolder(params: { folderId: string; pageSize?: number }): Promise<Record<string, unknown>> {
    return {
      folderId: params.folderId,
      files: [
        { id: 'file_001', name: 'Q3_Invoice_2026.pdf', mimeType: 'application/pdf' },
        { id: 'file_002', name: 'Budget_2026.xlsx', mimeType: 'application/vnd.google-apps.spreadsheet' },
      ],
      totalFiles: 2,
    };
  }
}

// ─── Slack Connector ─────────────────────────────────────────────────────────

export class SlackConnector extends BaseConnector {
  constructor() {
    super({
      provider: 'slack',
      displayName: 'Slack',
      authType: 'oauth2.0',
      scopes: ['chat:write', 'channels:read', 'users:read', 'files:read'],
      baseUrl: 'https://slack.com/api',
      docsUrl: 'https://api.slack.com',
    });
  }

  getTools(): ToolDefinition[] {
    return [
      {
        name: 'slack.post_message',
        description: 'Post a message to a Slack channel or user',
        provider: 'slack',
        parameters: {
          channel: { type: 'string', description: 'Channel ID or name (e.g., #general)' },
          text: { type: 'string', description: 'Message text' },
          blocks: { type: 'array', description: 'Rich message blocks (optional)' },
          threadTs: { type: 'string', description: 'Thread timestamp for replies' },
        },
        requiredScopes: ['chat:write'],
        riskLevel: 'medium',
        estimatedLatencyMs: 300,
        deprecated: false,
      },
      {
        name: 'slack.read_channel',
        description: 'Read messages from a Slack channel',
        provider: 'slack',
        parameters: {
          channel: { type: 'string', description: 'Channel ID or name' },
          limit: { type: 'number', description: 'Number of messages', default: 20 },
        },
        requiredScopes: ['channels:read'],
        riskLevel: 'low',
        estimatedLatencyMs: 250,
        deprecated: false,
      },
      {
        name: 'slack.upload_file',
        description: 'Upload a file to Slack',
        provider: 'slack',
        parameters: {
          channel: { type: 'string', description: 'Target channel' },
          filename: { type: 'string', description: 'File name' },
          content: { type: 'string', description: 'File content' },
        },
        requiredScopes: ['files:write'],
        riskLevel: 'medium',
        estimatedLatencyMs: 500,
        deprecated: false,
      },
    ];
  }

  async authenticate(credentials: Record<string, unknown>): Promise<{ success: boolean; connectionId?: string }> {
    const { botToken } = credentials;
    if (!botToken) return { success: false };

    const connection = await N0VA1OGateway.createConnection(
      'tenant_001',
      'user_001',
      'slack',
      'oauth2.0',
      this.config.scopes
    );

    return { success: true, connectionId: connection.connectionId };
  }

  async execute(tool: string, parameters: Record<string, unknown>): Promise<Record<string, unknown>> {
    switch (tool) {
      case 'slack.post_message':
        return this.postMessage(parameters as { channel: string; text: string });
      case 'slack.read_channel':
        return this.readChannel(parameters as { channel: string; limit?: number });
      case 'slack.upload_file':
        return this.uploadFile(parameters as { channel: string; filename: string; content: string });
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  }

  async refresh(connectionId: string): Promise<boolean> {
    const conn = N0VA1OGateway.getConnection(connectionId);
    if (!conn) return false;
    conn.encryptedTokens.expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    return true;
  }

  private async postMessage(params: { channel: string; text: string }): Promise<Record<string, unknown>> {
    return {
      ok: true,
      channel: params.channel,
      ts: `${Date.now()}.000000`,
      message: { text: params.text, type: 'message' },
    };
  }

  private async readChannel(params: { channel: string; limit?: number }): Promise<Record<string, unknown>> {
    return {
      ok: true,
      channel: params.channel,
      messages: [
        { ts: '1721000000.000000', user: 'U001', text: 'Hello team!' },
        { ts: '1721000100.000000', user: 'U002', text: 'Meeting at 3pm today' },
      ],
    };
  }

  private async uploadFile(params: { channel: string; filename: string; content: string }): Promise<Record<string, unknown>> {
    return {
      ok: true,
      file: {
        id: `F${Date.now()}`,
        name: params.filename,
        mimetype: 'application/octet-stream',
        size: params.content.length,
      },
    };
  }
}

// ─── Salesforce Connector ────────────────────────────────────────────────────

export class SalesforceConnector extends BaseConnector {
  constructor() {
    super({
      provider: 'salesforce',
      displayName: 'Salesforce CRM',
      authType: 'oauth2.0',
      scopes: ['api', 'refresh_token'],
      baseUrl: 'https://yourinstance.salesforce.com/services/data/v58.0',
      docsUrl: 'https://developer.salesforce.com',
    });
  }

  getTools(): ToolDefinition[] {
    return [
      {
        name: 'salesforce.query',
        description: 'Execute a SOQL query against Salesforce',
        provider: 'salesforce',
        parameters: {
          query: { type: 'string', description: 'SOQL query string' },
        },
        requiredScopes: ['api'],
        riskLevel: 'low',
        estimatedLatencyMs: 600,
        deprecated: false,
      },
      {
        name: 'salesforce.create_lead',
        description: 'Create a new lead in Salesforce',
        provider: 'salesforce',
        parameters: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          company: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          status: { type: 'string', default: 'Open - Not Contacted' },
        },
        requiredScopes: ['api'],
        riskLevel: 'medium',
        estimatedLatencyMs: 500,
        deprecated: false,
      },
      {
        name: 'salesforce.update_opportunity',
        description: 'Update an existing opportunity',
        provider: 'salesforce',
        parameters: {
          opportunityId: { type: 'string' },
          stage: { type: 'string' },
          amount: { type: 'number' },
          closeDate: { type: 'string' },
        },
        requiredScopes: ['api'],
        riskLevel: 'high',
        estimatedLatencyMs: 550,
        deprecated: false,
      },
    ];
  }

  async authenticate(credentials: Record<string, unknown>): Promise<{ success: boolean; connectionId?: string }> {
    const { instanceUrl, accessToken } = credentials;
    if (!instanceUrl || !accessToken) return { success: false };

    const connection = await N0VA1OGateway.createConnection(
      'tenant_001',
      'user_001',
      'salesforce',
      'oauth2.0',
      this.config.scopes
    );

    return { success: true, connectionId: connection.connectionId };
  }

  async execute(tool: string, parameters: Record<string, unknown>): Promise<Record<string, unknown>> {
    switch (tool) {
      case 'salesforce.query':
        return this.query(parameters as { query: string });
      case 'salesforce.create_lead':
        return this.createLead(parameters as Record<string, string>);
      case 'salesforce.update_opportunity':
        return this.updateOpportunity(parameters as Record<string, unknown>);
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  }

  async refresh(connectionId: string): Promise<boolean> {
    const conn = N0VA1OGateway.getConnection(connectionId);
    if (!conn) return false;
    conn.encryptedTokens.expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    return true;
  }

  private async query(params: { query: string }): Promise<Record<string, unknown>> {
    return {
      totalSize: 2,
      done: true,
      records: [
        { Id: '00Q001', Name: 'Acme Corp', Email: 'contact@acme.com' },
        { Id: '00Q002', Name: 'TechStart Inc', Email: 'info@techstart.io' },
      ],
    };
  }

  private async createLead(params: Record<string, string>): Promise<Record<string, unknown>> {
    return {
      id: `00Q${Date.now()}`,
      success: true,
      errors: [],
      ...params,
    };
  }

  private async updateOpportunity(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return {
      id: params.opportunityId as string,
      success: true,
      errors: [],
    };
  }
}

// ─── Connector Registry ──────────────────────────────────────────────────────

const connectorRegistry = new Map<string, BaseConnector>();

export function registerConnector(connector: BaseConnector): void {
  connectorRegistry.set(connector.getProvider(), connector);
  for (const tool of connector.getTools()) {
    N0VA1OGateway.registerTool(tool);
  }
}

export function getConnector(provider: string): BaseConnector | undefined {
  return connectorRegistry.get(provider);
}

export function listConnectors(): BaseConnector[] {
  return Array.from(connectorRegistry.values());
}

// Auto-register built-in connectors
registerConnector(new GoogleDriveConnector());
registerConnector(new SlackConnector());
registerConnector(new SalesforceConnector());

export * from '@n0va1o/core';
