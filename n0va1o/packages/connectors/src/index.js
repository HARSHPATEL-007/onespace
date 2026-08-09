"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SalesforceConnector = exports.SlackConnector = exports.GoogleDriveConnector = exports.BaseConnector = void 0;
exports.registerConnector = registerConnector;
exports.getConnector = getConnector;
exports.listConnectors = listConnectors;
const core_1 = require("@n0va1o/core");
class BaseConnector {
    config;
    oauthStates = new Map();
    webhookSubscriptions = new Map();
    constructor(config) {
        this.config = config;
    }
    getProvider() {
        return this.config.provider;
    }
    getDisplayName() {
        return this.config.displayName;
    }
    initiateOAuth(scopes, redirectUri) {
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
    completeOAuth(state, code) {
        const oauthState = this.oauthStates.get(state);
        if (!oauthState)
            throw new Error('Invalid OAuth state');
        this.oauthStates.delete(state);
        return { success: 'connected', scopes: oauthState.scopes };
    }
    subscribeWebhook(eventTypes, callbackUrl) {
        const sub = {
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
    unsubscribeWebhook(subscriptionId) {
        return this.webhookSubscriptions.delete(subscriptionId);
    }
    verifyWebhookSignature(payload, signature, secret) {
        const expected = computeHmac(payload, secret);
        return signature === expected;
    }
}
exports.BaseConnector = BaseConnector;
function computeHmac(payload, secret) {
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
class GoogleDriveConnector extends BaseConnector {
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
    getTools() {
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
    async authenticate(credentials) {
        const { accessToken, refreshToken } = credentials;
        if (!accessToken)
            return { success: false };
        const connection = await core_1.N0VA1OGateway.createConnection('tenant_001', 'user_001', 'google_drive', 'oauth2.0', this.config.scopes);
        return { success: true, connectionId: connection.connectionId };
    }
    async execute(tool, parameters) {
        switch (tool) {
            case 'google_drive.search_files':
                return this.searchFiles(parameters);
            case 'google_drive.read_file':
                return this.readFile(parameters);
            case 'google_drive.upload_file':
                return this.uploadFile(parameters);
            case 'google_drive.list_folder':
                return this.listFolder(parameters);
            default:
                throw new Error(`Unknown tool: ${tool}`);
        }
    }
    async refresh(connectionId) {
        const conn = core_1.N0VA1OGateway.getConnection(connectionId);
        if (!conn)
            return false;
        conn.encryptedTokens.expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
        return true;
    }
    async searchFiles(params) {
        return {
            files: [
                { id: 'file_001', name: 'Q3_Invoice_2026.pdf', mimeType: 'application/pdf', size: 245000 },
                { id: 'file_002', name: 'Q3_Report.xlsx', mimeType: 'application/vnd.google-apps.spreadsheet', size: 128000 },
            ],
            totalResults: 2,
            query: params.query,
        };
    }
    async readFile(params) {
        return {
            fileId: params.fileId,
            content: 'base64_encoded_content...',
            mimeType: 'application/pdf',
            size: 245000,
        };
    }
    async uploadFile(params) {
        return {
            fileId: `file_${Date.now()}`,
            name: params.name,
            mimeType: params.mimeType,
            webViewLink: `https://drive.google.com/file/d/file_${Date.now()}`,
        };
    }
    async listFolder(params) {
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
exports.GoogleDriveConnector = GoogleDriveConnector;
// ─── Slack Connector ─────────────────────────────────────────────────────────
class SlackConnector extends BaseConnector {
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
    getTools() {
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
    async authenticate(credentials) {
        const { botToken } = credentials;
        if (!botToken)
            return { success: false };
        const connection = await core_1.N0VA1OGateway.createConnection('tenant_001', 'user_001', 'slack', 'oauth2.0', this.config.scopes);
        return { success: true, connectionId: connection.connectionId };
    }
    async execute(tool, parameters) {
        switch (tool) {
            case 'slack.post_message':
                return this.postMessage(parameters);
            case 'slack.read_channel':
                return this.readChannel(parameters);
            case 'slack.upload_file':
                return this.uploadFile(parameters);
            default:
                throw new Error(`Unknown tool: ${tool}`);
        }
    }
    async refresh(connectionId) {
        const conn = core_1.N0VA1OGateway.getConnection(connectionId);
        if (!conn)
            return false;
        conn.encryptedTokens.expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
        return true;
    }
    async postMessage(params) {
        return {
            ok: true,
            channel: params.channel,
            ts: `${Date.now()}.000000`,
            message: { text: params.text, type: 'message' },
        };
    }
    async readChannel(params) {
        return {
            ok: true,
            channel: params.channel,
            messages: [
                { ts: '1721000000.000000', user: 'U001', text: 'Hello team!' },
                { ts: '1721000100.000000', user: 'U002', text: 'Meeting at 3pm today' },
            ],
        };
    }
    async uploadFile(params) {
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
exports.SlackConnector = SlackConnector;
// ─── Salesforce Connector ────────────────────────────────────────────────────
class SalesforceConnector extends BaseConnector {
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
    getTools() {
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
    async authenticate(credentials) {
        const { instanceUrl, accessToken } = credentials;
        if (!instanceUrl || !accessToken)
            return { success: false };
        const connection = await core_1.N0VA1OGateway.createConnection('tenant_001', 'user_001', 'salesforce', 'oauth2.0', this.config.scopes);
        return { success: true, connectionId: connection.connectionId };
    }
    async execute(tool, parameters) {
        switch (tool) {
            case 'salesforce.query':
                return this.query(parameters);
            case 'salesforce.create_lead':
                return this.createLead(parameters);
            case 'salesforce.update_opportunity':
                return this.updateOpportunity(parameters);
            default:
                throw new Error(`Unknown tool: ${tool}`);
        }
    }
    async refresh(connectionId) {
        const conn = core_1.N0VA1OGateway.getConnection(connectionId);
        if (!conn)
            return false;
        conn.encryptedTokens.expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
        return true;
    }
    async query(params) {
        return {
            totalSize: 2,
            done: true,
            records: [
                { Id: '00Q001', Name: 'Acme Corp', Email: 'contact@acme.com' },
                { Id: '00Q002', Name: 'TechStart Inc', Email: 'info@techstart.io' },
            ],
        };
    }
    async createLead(params) {
        return {
            id: `00Q${Date.now()}`,
            success: true,
            errors: [],
            ...params,
        };
    }
    async updateOpportunity(params) {
        return {
            id: params.opportunityId,
            success: true,
            errors: [],
        };
    }
}
exports.SalesforceConnector = SalesforceConnector;
// ─── Connector Registry ──────────────────────────────────────────────────────
const connectorRegistry = new Map();
function registerConnector(connector) {
    connectorRegistry.set(connector.getProvider(), connector);
    for (const tool of connector.getTools()) {
        core_1.N0VA1OGateway.registerTool(tool);
    }
}
function getConnector(provider) {
    return connectorRegistry.get(provider);
}
function listConnectors() {
    return Array.from(connectorRegistry.values());
}
// Auto-register built-in connectors
registerConnector(new GoogleDriveConnector());
registerConnector(new SlackConnector());
registerConnector(new SalesforceConnector());
__exportStar(require("@n0va1o/core"), exports);
