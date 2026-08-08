export type HITLLevel = "standard" | "elevated" | "executive" | "blocked";

export interface HITLCheck {
  requiresHuman: boolean;
  level: HITLLevel;
  reason: string;
  action: string;
  metadata: Record<string, unknown>;
}

export interface ActionContext {
  financialImpactUsd: number;
  recipientCount: number;
  isDestructive: boolean;
  isCrossTenant: boolean;
  isPrivilegeEscalation: boolean;
  isPHI: boolean;
  tier: string;
}

const THRESHOLDS = {
  financial: { executive: 5000, elevated: 1000 },
  recipients: { executive: 500, elevated: 100 },
};

export function evaluateHITL(
  action: string,
  context: ActionContext,
): HITLCheck {
  const lower = action.toLowerCase();

  if (context.isDestructive && context.financialImpactUsd > 0) {
    return _hitl(
      true,
      "executive",
      "Destructive action with financial impact",
      action,
      context,
    );
  }

  if (context.financialImpactUsd >= THRESHOLDS.financial.executive) {
    return _hitl(
      true,
      "executive",
      `Financial impact $${context.financialImpactUsd} exceeds $${THRESHOLDS.financial.executive} threshold`,
      action,
      context,
    );
  }

  if (context.financialImpactUsd >= THRESHOLDS.financial.elevated) {
    return _hitl(
      true,
      "elevated",
      `Financial impact $${context.financialImpactUsd} exceeds $${THRESHOLDS.financial.elevated} threshold`,
      action,
      context,
    );
  }

  if (context.recipientCount >= THRESHOLDS.recipients.executive) {
    return _hitl(
      true,
      "executive",
      `Recipient count ${context.recipientCount} exceeds ${THRESHOLDS.recipients.executive} threshold`,
      action,
      context,
    );
  }

  if (context.recipientCount >= THRESHOLDS.recipients.elevated) {
    return _hitl(
      true,
      "elevated",
      `Recipient count ${context.recipientCount} exceeds ${THRESHOLDS.recipients.elevated} threshold`,
      action,
      context,
    );
  }

  if (context.isDestructive) {
    return _hitl(
      true,
      "elevated",
      "Destructive action requires confirmation",
      action,
      context,
    );
  }

  if (context.isCrossTenant) {
    return _hitl(
      true,
      "executive",
      "Cross-tenant data sharing requires approval",
      action,
      context,
    );
  }

  if (context.isPrivilegeEscalation) {
    return _hitl(
      true,
      "executive",
      "Privilege escalation requires C-level approval",
      action,
      context,
    );
  }

  if (context.isPHI) {
    return _hitl(
      true,
      "elevated",
      "PHI modification requires clinical review",
      action,
      context,
    );
  }

  if (lower.includes("delete") && context.tier !== "transcendent") {
    return _hitl(
      true,
      "standard",
      "Deletion action requires secondary confirmation",
      action,
      context,
    );
  }

  return _hitl(
    false,
    "standard",
    "Action approved for automatic execution",
    action,
    context,
  );
}

function _hitl(
  requiresHuman: boolean,
  level: HITLLevel,
  reason: string,
  action: string,
  context: ActionContext,
): HITLCheck {
  return { requiresHuman, level, reason, action, metadata: { ...context } };
}

export function createHITLChecker() {
  return { evaluate: evaluateHITL };
}
