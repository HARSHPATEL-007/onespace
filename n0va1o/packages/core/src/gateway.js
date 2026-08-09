"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.N0VA1OGateway = void 0;
exports.registerTool = registerTool;
exports.getTool = getTool;
exports.listTools = listTools;
exports.registerAgent = registerAgent;
exports.getAgent = getAgent;
exports.createSession = createSession;
exports.getSession = getSession;
exports.setSessionState = setSessionState;
exports.discoverTools = discoverTools;
exports.createConnection = createConnection;
exports.getConnection = getConnection;
exports.selectTransport = selectTransport;
exports.logAction = logAction;
exports.getAuditLog = getAuditLog;
exports.registerWebhookHandler = registerWebhookHandler;
exports.emitWebhook = emitWebhook;
exports.assessRisk = assessRisk;
exports.createHITLRequest = createHITLRequest;
exports.resolveHITLRequest = resolveHITLRequest;
exports.getHITLRequest = getHITLRequest;
exports.executeInSandbox = executeInSandbox;
exports.getSandboxExecution = getSandboxExecution;
exports.applySchemaModifiers = applySchemaModifiers;
const crypto_1 = require("crypto");
const types_1 = require("./types");
// ─── In-Memory Stores (replace with DB in production) ───────────────────────
const agents = new Map();
const sessions = new Map();
const connections = new Map();
const tools = new Map();
const auditLog = [];
const hitlRequests = new Map();
const sandboxExecutions = new Map();
const webhookHandlers = new Map();
// ─── Tool Registry ───────────────────────────────────────────────────────────
function registerTool(tool) {
    tools.set(tool.name, tool);
}
function getTool(name) {
    return tools.get(name);
}
function listTools() {
    return Array.from(tools.values());
}
// ─── Agent Management ────────────────────────────────────────────────────────
async function registerAgent(tenantToken, config) {
    const agentId = `agent_${(0, crypto_1.randomUUID)().replace(/-/g, '').slice(0, 12)}`;
    const apiKey = `n0va_sk_${(0, crypto_1.randomUUID)().replace(/-/g, '')}`;
    const connectedAccount = `ca_${(0, crypto_1.randomUUID)().replace(/-/g, '').slice(0, 12)}`;
    const agent = {
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
function getAgent(agentId) {
    return agents.get(agentId);
}
function resolveAvailableTools(config) {
    return Array.from(tools.values())
        .filter((tool) => {
        if (tool.riskLevel === 'critical' && config.autonomyLevel !== 'full')
            return false;
        if (tool.riskLevel === 'high' && config.autonomyLevel === 'low')
            return false;
        return true;
    })
        .map((t) => t.name);
}
// ─── Session Management ──────────────────────────────────────────────────────
async function createSession(config) {
    const agent = agents.get(config.agentId);
    if (!agent)
        throw new types_1.N0VA1OError('N0VA1O_NOT_FOUND', 'Agent not found');
    const sessionId = `sess_${(0, crypto_1.randomUUID)().replace(/-/g, '').slice(0, 12)}`;
    const toolsToInject = config.tools
        ? config.tools.filter(t => agent.toolsAvailable.includes(t))
        : agent.toolsAvailable.slice(0, 10);
    const session = {
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
function getSession(sessionId) {
    return sessions.get(sessionId);
}
function setSessionState(sessionId, state) {
    const session = sessions.get(sessionId);
    if (session)
        session.state = state;
}
// ─── Intent-Based Tool Discovery ─────────────────────────────────────────────
async function discoverTools(query, agentId, maxTools = 5) {
    const agent = agents.get(agentId);
    if (!agent)
        throw new types_1.N0VA1OError('N0VA1O_NOT_FOUND', 'Agent not found');
    const queryLower = query.toLowerCase();
    const scored = [];
    for (const tool of tools.values()) {
        if (!agent.toolsAvailable.includes(tool.name))
            continue;
        if (tool.deprecated)
            continue;
        let relevance = 0;
        const queryTerms = queryLower.split(/\s+/);
        for (const term of queryTerms) {
            if (tool.name.toLowerCase().includes(term))
                relevance += 0.3;
            if (tool.description.toLowerCase().includes(term))
                relevance += 0.2;
            if (tool.provider.toLowerCase().includes(term))
                relevance += 0.15;
        }
        // Intent matching heuristics
        if (queryLower.includes('find') || queryLower.includes('search')) {
            if (tool.name.includes('search') || tool.name.includes('list') || tool.name.includes('read'))
                relevance += 0.25;
        }
        if (queryLower.includes('create') || queryLower.includes('upload') || queryLower.includes('send')) {
            if (tool.name.includes('create') || tool.name.includes('upload') || tool.name.includes('post') || tool.name.includes('send'))
                relevance += 0.25;
        }
        if (queryLower.includes('convert') || queryLower.includes('transform')) {
            if (tool.name.includes('convert') || tool.name.includes('transform'))
                relevance += 0.3;
        }
        if (queryLower.includes('notify') || queryLower.includes('message')) {
            if (tool.name.includes('post') || tool.name.includes('send') || tool.name.includes('notify'))
                relevance += 0.25;
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
function classifyIntent(query) {
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
async function createConnection(tenantId, userId, provider, authType, scopes = []) {
    const connectionId = `ca_${(0, crypto_1.randomUUID)().replace(/-/g, '').slice(0, 12)}`;
    const connection = {
        connectionId,
        tenantId,
        userId,
        provider,
        authType,
        encryptedTokens: {
            accessToken: Buffer.from(`encrypted_${(0, crypto_1.randomUUID)()}`),
            refreshToken: Buffer.from(`encrypted_${(0, crypto_1.randomUUID)()}`),
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
function getConnection(connectionId) {
    return connections.get(connectionId);
}
// ─── Transport Selection ─────────────────────────────────────────────────────
function selectTransport(context) {
    if (context.environment === 'local_ide')
        return 'stdio';
    if (context.requiresBidirectional)
        return 'websocket';
    return 'http_sse';
}
// ─── Audit Logging ───────────────────────────────────────────────────────────
function logAction(entry) {
    const auditId = `audit_${(0, crypto_1.randomUUID)().replace(/-/g, '').slice(0, 16)}`;
    const timestamp = new Date().toISOString();
    const hash = computeHash({ ...entry, auditId, timestamp });
    const fullEntry = { ...entry, auditId, timestamp, hash };
    auditLog.push(fullEntry);
    return fullEntry;
}
function getAuditLog(filters) {
    let results = auditLog;
    if (filters?.agentId)
        results = results.filter(e => e.agentId === filters.agentId);
    if (filters?.sessionId)
        results = results.filter(e => e.sessionId === filters.sessionId);
    if (filters?.tenantId)
        results = results.filter(e => e.tenantId === filters.tenantId);
    return results;
}
function computeHash(data) {
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
function registerWebhookHandler(eventType, handler) {
    if (!webhookHandlers.has(eventType)) {
        webhookHandlers.set(eventType, new Set());
    }
    webhookHandlers.get(eventType).add(handler);
}
async function emitWebhook(eventType, tenantId, payload) {
    const event = {
        eventId: `evt_${(0, crypto_1.randomUUID)().replace(/-/g, '').slice(0, 12)}`,
        eventType,
        timestamp: new Date().toISOString(),
        tenantId,
        payload,
        signature: `sig_${(0, crypto_1.randomUUID)().replace(/-/g, '').slice(0, 16)}`,
    };
    const handlers = webhookHandlers.get(eventType);
    if (handlers) {
        for (const handler of handlers) {
            handler(event);
        }
    }
}
// ─── HITL System ─────────────────────────────────────────────────────────────
function assessRisk(tool, parameters) {
    const toolDef = tools.get(tool);
    if (!toolDef)
        return { level: 'medium', score: 0.5 };
    let score = 0;
    if (toolDef.riskLevel === 'critical')
        score += 0.4;
    else if (toolDef.riskLevel === 'high')
        score += 0.25;
    else if (toolDef.riskLevel === 'medium')
        score += 0.1;
    const paramStr = JSON.stringify(parameters).toLowerCase();
    if (paramStr.includes('delete') || paramStr.includes('remove'))
        score += 0.3;
    if (paramStr.includes('transfer') || paramStr.includes('payment'))
        score += 0.25;
    if (paramStr.includes('all') || paramStr.includes('bulk'))
        score += 0.15;
    score = Math.min(score, 1.0);
    if (score >= 0.8)
        return { level: 'critical', score };
    if (score >= 0.5)
        return { level: 'high', score };
    if (score >= 0.2)
        return { level: 'medium', score };
    return { level: 'low', score };
}
function createHITLRequest(sessionId, agentId, proposedAction, reasoning, dataAccessed) {
    const { level, score } = assessRisk(proposedAction.tool, proposedAction.parameters);
    const now = Date.now();
    const timeoutMs = level === 'critical' ? 4 * 3600 * 1000 : 24 * 3600 * 1000;
    const request = {
        requestId: `hitl_${(0, crypto_1.randomUUID)().replace(/-/g, '').slice(0, 12)}`,
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
function resolveHITLRequest(requestId, resolution, resolvedBy, modifiedParameters) {
    const request = hitlRequests.get(requestId);
    if (!request)
        throw new types_1.N0VA1OError('N0VA1O_NOT_FOUND', 'HITL request not found');
    request.status = resolution === 'approved' ? 'approved' :
        resolution === 'rejected' ? 'rejected' : 'modified';
    request.resolvedBy = resolvedBy;
    request.resolvedAt = new Date().toISOString();
    request.digitalSignature = `sig_${(0, crypto_1.randomUUID)().replace(/-/g, '').slice(0, 16)}`;
    if (modifiedParameters)
        request.modifiedParameters = modifiedParameters;
    return request;
}
function getHITLRequest(requestId) {
    return hitlRequests.get(requestId);
}
// ─── Sandbox Execution ──────────────────────────────────────────────────────
async function executeInSandbox(sessionId, code, language = 'python', config) {
    const executionId = `exec_${(0, crypto_1.randomUUID)().replace(/-/g, '').slice(0, 12)}`;
    const execution = {
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
    }
    catch {
        execution.status = 'failed';
        execution.exitCode = 1;
        execution.stderr = 'Execution failed';
    }
    return execution;
}
function getSandboxExecution(executionId) {
    return sandboxExecutions.get(executionId);
}
// ─── Schema Modifiers ────────────────────────────────────────────────────────
function applySchemaModifiers(toolDef, agentConfig) {
    const modified = { ...toolDef };
    // Field redaction based on autonomy level
    if (agentConfig.autonomyLevel !== 'full') {
        modified.parameters = redactDangerousFields(modified.parameters);
    }
    // Value capping
    modified.parameters = capNumericalValues(modified.parameters);
    return modified;
}
function redactDangerousFields(params) {
    const dangerous = ['delete', 'remove', 'destroy', 'purge', 'drop', 'truncate'];
    const result = {};
    for (const [key, value] of Object.entries(params)) {
        if (dangerous.some(d => key.toLowerCase().includes(d))) {
            continue;
        }
        result[key] = value;
    }
    return result;
}
function capNumericalValues(params) {
    const result = {};
    for (const [key, value] of Object.entries(params)) {
        if (typeof value === 'number' && key.toLowerCase().includes('budget')) {
            result[key] = Math.min(value, 50000);
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
// ─── Export Gateway API ──────────────────────────────────────────────────────
exports.N0VA1OGateway = {
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
