import { N0VA1OGateway, HITLRequest, RiskLevel } from '@n0va1o/core';

// ─── Risk Assessment Engine ──────────────────────────────────────────────────

export interface RiskAssessment {
  level: RiskLevel;
  score: number;
  factors: string[];
  recommendedAction: 'auto_execute' | 'notify' | 'queue_approval' | 'block_escalate';
  timeoutMs: number;
}

export interface RiskPolicy {
  name: string;
  description: string;
  condition: (tool: string, params: Record<string, unknown>, agentAutonomy: string) => boolean;
  riskModifier: number;
}

const defaultRiskPolicies: RiskPolicy[] = [
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

export function assessRisk(
  tool: string,
  parameters: Record<string, unknown>,
  agentAutonomy: string,
  customPolicies: RiskPolicy[] = []
): RiskAssessment {
  const allPolicies = [...defaultRiskPolicies, ...customPolicies];
  let score = 0;
  const factors: string[] = [];

  const baseAssessment = N0VA1OGateway.assessRisk(tool, parameters);
  score = baseAssessment.score;
  factors.push(`Base risk level: ${baseAssessment.level}`);

  for (const policy of allPolicies) {
    if (policy.condition(tool, parameters, agentAutonomy)) {
      score += policy.riskModifier;
      factors.push(policy.description);
    }
  }

  score = Math.min(score, 1.0);

  let level: RiskLevel;
  let recommendedAction: RiskAssessment['recommendedAction'];
  let timeoutMs: number;

  if (score >= 0.8) {
    level = 'critical';
    recommendedAction = 'block_escalate';
    timeoutMs = 4 * 3600 * 1000;
  } else if (score >= 0.5) {
    level = 'high';
    recommendedAction = 'queue_approval';
    timeoutMs = 24 * 3600 * 1000;
  } else if (score >= 0.2) {
    level = 'medium';
    recommendedAction = 'notify';
    timeoutMs = 72 * 3600 * 1000;
  } else {
    level = 'low';
    recommendedAction = 'auto_execute';
    timeoutMs = 0;
  }

  return { level, score, factors, recommendedAction, timeoutMs };
}

// ─── Interrogation Room ──────────────────────────────────────────────────────

export interface InterrogationRoomState {
  requestId: string;
  sessionId: string;
  agentId: string;
  status: 'active' | 'resolved' | 'timeout' | 'escalated';
  agentReasoning: string[];
  dataAccessed: string[];
  proposedAction: {
    tool: string;
    parameters: Record<string, unknown>;
  };
  riskAssessment: RiskAssessment;
  humanReviewers: string[];
  notificationsSent: string[];
  createdAt: string;
  resolvedAt?: string;
  resolution?: 'approved' | 'rejected' | 'modified';
  modifiedParameters?: Record<string, unknown>;
  digitalSignature?: string;
}

export interface ReviewerNotification {
  requestId: string;
  channels: ['push' | 'email' | 'slack'];
  reviewers: string[];
  urgency: RiskLevel;
  message: string;
}

export class InterrogationRoom {
  private rooms = new Map<string, InterrogationRoomState>();
  private reviewers: string[] = [];
  private notificationHandlers: ((n: ReviewerNotification) => void)[] = [];

  constructor(reviewers: string[] = ['admin@n0va.io']) {
    this.reviewers = reviewers;
  }

  addReviewer(email: string): void {
    if (!this.reviewers.includes(email)) {
      this.reviewers.push(email);
    }
  }

  onNotification(handler: (notification: ReviewerNotification) => void): void {
    this.notificationHandlers.push(handler);
  }

  async initiate(
    sessionId: string,
    agentId: string,
    proposedAction: { tool: string; parameters: Record<string, unknown> },
    agentReasoning: string[],
    dataAccessed: string[],
    agentAutonomy: string
  ): Promise<InterrogationRoomState> {
    const riskAssessment = assessRisk(proposedAction.tool, proposedAction.parameters, agentAutonomy);

    const hitlRequest = N0VA1OGateway.createHITLRequest(
      sessionId,
      agentId,
      proposedAction,
      agentReasoning,
      dataAccessed
    );

    const room: InterrogationRoomState = {
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

  async resolve(
    requestId: string,
    resolution: 'approved' | 'rejected' | 'modified',
    resolvedBy: string,
    modifiedParameters?: Record<string, unknown>
  ): Promise<InterrogationRoomState> {
    const room = this.rooms.get(requestId);
    if (!room) throw new Error('Interrogation room not found');
    if (room.status !== 'active') throw new Error(`Room is already ${room.status}`);

    const hitlResult = N0VA1OGateway.resolveHITLRequest(requestId, resolution, resolvedBy, modifiedParameters);

    room.status = 'resolved';
    room.resolution = resolution;
    room.resolvedAt = hitlResult.resolvedAt;
    room.digitalSignature = hitlResult.digitalSignature;
    if (modifiedParameters) room.modifiedParameters = modifiedParameters;

    return room;
  }

  escalate(requestId: string, escalatedTo: string): InterrogationRoomState {
    const room = this.rooms.get(requestId);
    if (!room) throw new Error('Interrogation room not found');

    room.status = 'escalated';
    room.humanReviewers.push(escalatedTo);

    this.sendNotifications(room, true);
    return room;
  }

  getRoom(requestId: string): InterrogationRoomState | undefined {
    return this.rooms.get(requestId);
  }

  listActive(): InterrogationRoomState[] {
    return Array.from(this.rooms.values()).filter(r => r.status === 'active');
  }

  getRoomSummary(requestId: string): Record<string, unknown> | undefined {
    const room = this.rooms.get(requestId);
    if (!room) return undefined;

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

  private async sendNotifications(room: InterrogationRoomState, isEscalation = false): Promise<void> {
    const notification: ReviewerNotification = {
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

// ─── Approval Workflow Engine ────────────────────────────────────────────────

export interface ApprovalWorkflow {
  id: string;
  name: string;
  description: string;
  steps: ApprovalStep[];
  parallelApproval: boolean;
  minApprovers: number;
}

export interface ApprovalStep {
  order: number;
  role: string;
  action: 'review' | 'approve' | 'veto';
  timeoutHours: number;
  escalateTo?: string;
}

export class ApprovalWorkflowEngine {
  private workflows = new Map<string, ApprovalWorkflow>();
  private activeWorkflows = new Map<string, Map<string, string>>(); // requestId -> (step -> status)

  createWorkflow(workflow: ApprovalWorkflow): void {
    this.workflows.set(workflow.id, workflow);
  }

  getWorkflow(id: string): ApprovalWorkflow | undefined {
    return this.workflows.get(id);
  }

  initiateWorkflow(workflowId: string, requestId: string): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error('Workflow not found');

    const stepStatus = new Map<string, string>();
    for (const step of workflow.steps) {
      stepStatus.set(`step_${step.order}`, 'pending');
    }
    this.activeWorkflows.set(requestId, stepStatus);
  }

  async approveStep(requestId: string, stepOrder: number, approver: string): Promise<boolean> {
    const stepStatus = this.activeWorkflows.get(requestId);
    if (!stepStatus) throw new Error('Workflow instance not found');

    stepStatus.set(`step_${stepOrder}`, `approved_by_${approver}`);

    // Check if all steps are complete
    const allApproved = Array.from(stepStatus.values()).every(s => s.startsWith('approved'));
    return allApproved;
  }

  getWorkflowStatus(requestId: string): Map<string, string> | undefined {
    return this.activeWorkflows.get(requestId);
  }
}

// ─── Convenience exports ─────────────────────────────────────────────────────

export function createInterrogationRoom(reviewers?: string[]): InterrogationRoom {
  return new InterrogationRoom(reviewers);
}

export function createApprovalEngine(): ApprovalWorkflowEngine {
  return new ApprovalWorkflowEngine();
}

export * from '@n0va1o/core';
