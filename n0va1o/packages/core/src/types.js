"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.N0VA1OError = exports.SessionConfigSchema = exports.AgentConfigSchema = void 0;
const zod_1 = require("zod");
// ─── Agent Types ─────────────────────────────────────────────────────────────
exports.AgentConfigSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(128),
    type: zod_1.z.enum(['workflow_orchestrator', 'concierge', 'reply_assistant', 'task_extractor', 'campaign_orchestrator', 'infrastructure_orchestrator', 'custom']),
    description: zod_1.z.string().max(512).optional(),
    permissions: zod_1.z.array(zod_1.z.string()),
    autonomyLevel: zod_1.z.enum(['low', 'medium', 'high', 'full']),
    approvalRequiredFor: zod_1.z.array(zod_1.z.string()).default([]),
    sandboxEnabled: zod_1.z.boolean().default(true),
    neuralMode: zod_1.z.boolean().default(false),
    maxDailyActions: zod_1.z.number().int().positive().default(10000),
    contextWindow: zod_1.z.number().int().positive().default(128000),
    preferredModel: zod_1.z.string().default('claude-3-5-sonnet'),
    fallbackModel: zod_1.z.string().optional(),
});
// ─── Session Types ───────────────────────────────────────────────────────────
exports.SessionConfigSchema = zod_1.z.object({
    agentId: zod_1.z.string(),
    context: zod_1.z.object({
        userId: zod_1.z.string(),
        tenantId: zod_1.z.string(),
        sessionType: zod_1.z.enum(['interactive', 'autonomous', 'batch']),
    }),
    tools: zod_1.z.array(zod_1.z.string()).optional(),
    sandboxConfig: zod_1.z.object({
        cpuQuota: zod_1.z.number().int().max(32).default(2),
        ramQuota: zod_1.z.number().int().max(131072).default(4096),
        timeoutSeconds: zod_1.z.number().int().max(7200).default(600),
        networkMode: zod_1.z.enum(['isolated', 'filtered', 'full']).default('filtered'),
        allowedDomains: zod_1.z.array(zod_1.z.string()).optional(),
    }).optional(),
});
class N0VA1OError extends Error {
    code;
    retryable;
    retryAfterMs;
    constructor(code, message, retryable = false, retryAfterMs) {
        super(message);
        this.code = code;
        this.retryable = retryable;
        this.retryAfterMs = retryAfterMs;
        this.name = 'N0VA1OError';
    }
}
exports.N0VA1OError = N0VA1OError;
