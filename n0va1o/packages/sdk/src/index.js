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
exports.N0VA1OClient = void 0;
exports.createClient = createClient;
const core_1 = require("@n0va1o/core");
class N0VA1OClient {
    apiKey;
    tenantId;
    endpoint;
    transport;
    timeout;
    constructor(config) {
        this.apiKey = config.apiKey;
        this.tenantId = config.tenantId;
        this.endpoint = config.endpoint;
        this.transport = config.transport;
        this.timeout = config.timeout ?? 30000;
    }
    // ─── Agent Operations ───────────────────────────────────────────────────
    async registerAgent(config) {
        return core_1.N0VA1OGateway.registerAgent(this.apiKey, config);
    }
    getAgent(agentId) {
        return core_1.N0VA1OGateway.getAgent(agentId);
    }
    // ─── Session Operations ─────────────────────────────────────────────────
    async createSession(config) {
        return core_1.N0VA1OGateway.createSession(config);
    }
    getSession(sessionId) {
        return core_1.N0VA1OGateway.getSession(sessionId);
    }
    setSessionState(sessionId, state) {
        core_1.N0VA1OGateway.setSessionState(sessionId, state);
    }
    // ─── Tool Operations ────────────────────────────────────────────────────
    async discoverTools(query, agentId, maxTools) {
        return core_1.N0VA1OGateway.discoverTools(query, agentId, maxTools);
    }
    listTools() {
        return core_1.N0VA1OGateway.listTools();
    }
    // ─── Connection Operations ──────────────────────────────────────────────
    async createConnection(userId, provider, authType, scopes) {
        return core_1.N0VA1OGateway.createConnection(this.tenantId, userId, provider, authType, scopes);
    }
    getConnection(connectionId) {
        return core_1.N0VA1OGateway.getConnection(connectionId);
    }
    // ─── Sandbox Operations ─────────────────────────────────────────────────
    async executeInSandbox(sessionId, code, language = 'python', config) {
        return core_1.N0VA1OGateway.executeInSandbox(sessionId, code, language, config);
    }
    getSandboxExecution(executionId) {
        return core_1.N0VA1OGateway.getSandboxExecution(executionId);
    }
    // ─── HITL Operations ────────────────────────────────────────────────────
    getHITLRequest(requestId) {
        return core_1.N0VA1OGateway.getHITLRequest(requestId);
    }
    resolveHITLRequest(requestId, resolution, resolvedBy, modifiedParameters) {
        return core_1.N0VA1OGateway.resolveHITLRequest(requestId, resolution, resolvedBy, modifiedParameters);
    }
    // ─── Audit Operations ───────────────────────────────────────────────────
    getAuditLog(filters) {
        return core_1.N0VA1OGateway.getAuditLog({ ...filters, tenantId: this.tenantId });
    }
    // ─── Webhook Operations ─────────────────────────────────────────────────
    onWebhookEvent(eventType, handler) {
        core_1.N0VA1OGateway.registerWebhookHandler(eventType, handler);
    }
    async emitWebhook(eventType, payload) {
        return core_1.N0VA1OGateway.emitWebhook(eventType, this.tenantId, payload);
    }
    // ─── Utility ────────────────────────────────────────────────────────────
    getConfig() {
        return {
            apiKey: this.apiKey,
            tenantId: this.tenantId,
            endpoint: this.endpoint,
            transport: this.transport,
            timeout: this.timeout,
        };
    }
}
exports.N0VA1OClient = N0VA1OClient;
// ─── Convenience exports ─────────────────────────────────────────────────────
function createClient(config) {
    return new N0VA1OClient(config);
}
__exportStar(require("@n0va1o/core"), exports);
