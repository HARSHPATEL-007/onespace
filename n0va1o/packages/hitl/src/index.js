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
exports.ApprovalWorkflowEngine = exports.InterrogationRoom = void 0;
exports.assessRisk = assessRisk;
exports.createInterrogationRoom = createInterrogationRoom;
exports.createApprovalEngine = createApprovalEngine;
const core_1 = require("@n0va1o/core");
const defaultRiskPolicies = [
    {
        name: 'financial_transaction',
        description: 'Any action involving money transfer or payment',
        condition: (tool, params) => {
            const str = JSON.stringify(params).toLowerCase();
            return str.includes('transfer') || str.includes('payment') || str.includes('amount') || str.includes('budget');
        },
        riskModifier: 0.3,
    },
    {
        name: 'mass_operation',
        description: 'Bulk operations affecting many records',
        condition: (tool, params) => {
            const str = JSON.stringify(params).toLowerCase();
            return str.includes('all') || str.includes('bulk') || str.includes('batch');
        },
        riskModifier: 0.2,
    },
    {
        name: 'data_deletion',
        description: 'Delete or destroy operations',
        condition: (tool, params) => {
            const str = JSON.stringify(params).toLowerCase();
            return str.includes('delete') || str.includes('remove') || str.includes('destroy');
        },
        riskModifier: 0.35,
    },
    {
        name: 'external_commitment',
        description: 'Actions that create external obligations',
        condition: (tool, params) => {
            const str = JSON.stringify(params).toLowerCase();
            return str.includes('send') || str.includes('post') || str.includes('publish') || str.includes('commit');
        },
        riskModifier: 0.15,
    },
    {
        name: 'privilege_escalation',
        description: 'Permission or role modifications',
        condition: (tool, params) => {
            const str = JSON.stringify(params).toLowerCase();
            return str.includes('role') || str.includes('permission') || str.includes('admin') || str.includes('access');
        },
        riskModifier: 0.4,
    },
    {
        name: 'low_autonomy_override',
        description: 'Low-autonomy agents attempting medium+ risk actions',
        condition: (tool, params, autonomy) => {
            return autonomy === 'low';
        },
        riskModifier: 0.15,
    },
];
function assessRisk(tool, parameters, agentAutonomy, customPolicies = []) {
    const allPolicies = [...defaultRiskPolicies, ...customPolicies];
    let score = 0;
    const factors = [];
    const baseAssessment = core_1.N0VA1OGateway.assessRisk(tool, parameters);
    score = baseAssessment.score;
    factors.push(`Base risk level: ${baseAssessment.level}`);
    for (const policy of allPolicies) {
        if (policy.condition(tool, parameters, agentAutonomy)) {
            score += policy.riskModifier;
            factors.push(policy.description);
        }
    }
    score = Math.min(score, 1.0);
    let level;
    let recommendedAction;
    let timeoutMs;
    if (score >= 0.8) {
        level = 'critical';
        recommendedAction = 'block_escalate';
        timeoutMs = 4 * 3600 * 1000;
    }
    else if (score >= 0.5) {
        level = 'high';
        recommendedAction = 'queue_approval';
        timeoutMs = 24 * 3600 * 1000;
    }
    else if (score >= 0.2) {
        level = 'medium';
        recommendedAction = 'notify';
        timeoutMs = 72 * 3600 * 1000;
    }
    else {
        level = 'low';
        recommendedAction = 'auto_execute';
        timeoutMs = 0;
    }
    return { level, score, factors, recommendedAction, timeoutMs };
}
class InterrogationRoom {
    rooms = new Map();
    reviewers = [];
    notificationHandlers = [];
    constructor(reviewers = ['admin@n0va.io']) {
        this.reviewers = reviewers;
    }
    addReviewer(email) {
        if (!this.reviewers.includes(email)) {
            this.reviewers.push(email);
        }
    }
    onNotification(handler) {
        this.notificationHandlers.push(handler);
    }
    async initiate(sessionId, agentId, proposedAction, agentReasoning, dataAccessed, agentAutonomy) {
        const riskAssessment = assessRisk(proposedAction.tool, proposedAction.parameters, agentAutonomy);
        const hitlRequest = core_1.N0VA1OGateway.createHITLRequest(sessionId, agentId, proposedAction, agentReasoning, dataAccessed);
        const room = {
            requestId: hitlRequest.requestId,
            sessionId,
            agentId,
            status: 'active',
            agentReasoning,
            dataAccessed,
            proposedAction,
            riskAssessment,
            humanReviewers: [...this.reviewers],
            notificationsSent: [],
            createdAt: new Date().toISOString(),
        };
        this.rooms.set(room.requestId, room);
        await this.sendNotifications(room);
        return room;
    }
    async resolve(requestId, resolution, resolvedBy, modifiedParameters) {
        const room = this.rooms.get(requestId);
        if (!room)
            throw new Error('Interrogation room not found');
        if (room.status !== 'active')
            throw new Error(`Room is already ${room.status}`);
        const hitlResult = core_1.N0VA1OGateway.resolveHITLRequest(requestId, resolution, resolvedBy, modifiedParameters);
        room.status = 'resolved';
        room.resolution = resolution;
        room.resolvedAt = hitlResult.resolvedAt;
        room.digitalSignature = hitlResult.digitalSignature;
        if (modifiedParameters)
            room.modifiedParameters = modifiedParameters;
        return room;
    }
    escalate(requestId, escalatedTo) {
        const room = this.rooms.get(requestId);
        if (!room)
            throw new Error('Interrogation room not found');
        room.status = 'escalated';
        room.humanReviewers.push(escalatedTo);
        this.sendNotifications(room, true);
        return room;
    }
    getRoom(requestId) {
        return this.rooms.get(requestId);
    }
    listActive() {
        return Array.from(this.rooms.values()).filter(r => r.status === 'active');
    }
    getRoomSummary(requestId) {
        const room = this.rooms.get(requestId);
        if (!room)
            return undefined;
        return {
            requestId: room.requestId,
            status: room.status,
            riskLevel: room.riskAssessment.level,
            riskScore: room.riskAssessment.score,
            proposedAction: room.proposedAction,
            agentReasoning: room.agentReasoning,
            dataAccessed: room.dataAccessed,
            factors: room.riskAssessment.factors,
            createdAt: room.createdAt,
            resolvedAt: room.resolvedAt,
            resolution: room.resolution,
        };
    }
    async sendNotifications(room, isEscalation = false) {
        const notification = {
            requestId: room.requestId,
            channels: ['push', 'email', 'slack'],
            reviewers: room.humanReviewers,
            urgency: room.riskAssessment.level,
            message: isEscalation
                ? `ESCALATED: High-risk agent action requires immediate review`
                : `Agent requires approval for ${room.proposedAction.tool} (Risk: ${room.riskAssessment.level})`,
        };
        room.notificationsSent.push(new Date().toISOString());
        for (const handler of this.notificationHandlers) {
            handler(notification);
        }
    }
}
exports.InterrogationRoom = InterrogationRoom;
class ApprovalWorkflowEngine {
    workflows = new Map();
    activeWorkflows = new Map(); // requestId -> (step -> status)
    createWorkflow(workflow) {
        this.workflows.set(workflow.id, workflow);
    }
    getWorkflow(id) {
        return this.workflows.get(id);
    }
    initiateWorkflow(workflowId, requestId) {
        const workflow = this.workflows.get(workflowId);
        if (!workflow)
            throw new Error('Workflow not found');
        const stepStatus = new Map();
        for (const step of workflow.steps) {
            stepStatus.set(`step_${step.order}`, 'pending');
        }
        this.activeWorkflows.set(requestId, stepStatus);
    }
    async approveStep(requestId, stepOrder, approver) {
        const stepStatus = this.activeWorkflows.get(requestId);
        if (!stepStatus)
            throw new Error('Workflow instance not found');
        stepStatus.set(`step_${stepOrder}`, `approved_by_${approver}`);
        // Check if all steps are complete
        const allApproved = Array.from(stepStatus.values()).every(s => s.startsWith('approved'));
        return allApproved;
    }
    getWorkflowStatus(requestId) {
        return this.activeWorkflows.get(requestId);
    }
}
exports.ApprovalWorkflowEngine = ApprovalWorkflowEngine;
// ─── Convenience exports ─────────────────────────────────────────────────────
function createInterrogationRoom(reviewers) {
    return new InterrogationRoom(reviewers);
}
function createApprovalEngine() {
    return new ApprovalWorkflowEngine();
}
__exportStar(require("@n0va1o/core"), exports);
