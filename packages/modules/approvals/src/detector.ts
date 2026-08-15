import { prisma } from "@n0va/db";
import { INTENT_PATTERNS, MONEY_RE, ERP_STATUS_RE } from "./constants";
import type { Role } from "@n0va/authz";

export interface DetectionInput {
  workspaceId: string;
  userId: string;
  role: Role;
  channelId: string;
  channelName?: string | null;
  channelTopic?: string | null;
  messageId: string;
  body: string;
  attachments?: Array<{ id: string; filename: string; mimeType?: string | null }>;
}

export interface DetectionResult {
  requestType: string | null;
  confidence: number;
  amountCents: number | null;
  signals: Array<{ type: string; weight: number }>;
  policyRuleId: string | null;
  policyRuleName: string | null;
  thresholdCents: number | null;
  costCenter: string | null;
  rationale: string;
  evidence: Array<{ type: string; id: string; label: string }>;
}

/**
 * Deterministic approval-intent detector. Returns null (no approval) or a
 * structured detection. Confidence 0..0.95:
 *   >= 0.7  -> RAISED (auto-create)
 *   0.45..0.7 -> DETECTED (draft for admin confirmation)
 *   < 0.45  -> ignored
 */
export async function detectApproval(input: DetectionInput): Promise<DetectionResult | null> {
  const body = input.body;

  // 1. Pattern signals per request type.
  const signals: DetectionResult["signals"] = [];
  const typeScores = new Map<string, { weight: number; count: number }>();
  for (const [type, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const { re, weight } of patterns) {
      if (re.test(body)) {
        const cur = typeScores.get(type) ?? { weight: 0, count: 0 };
        cur.weight = Math.max(cur.weight, weight);
        cur.count += 1;
        typeScores.set(type, cur);
        signals.push({ type, weight });
      }
    }
  }

  // 2. Money amount.
  let amountCents: number | null = null;
  const money = body.match(MONEY_RE);
  if (money) {
    const dollars = parseInt((money[1] ?? "0").replace(/,/g, ""), 10);
    const cents = money[2] ? parseInt(money[2].padEnd(2, "0"), 10) : 0;
    amountCents = dollars * 100 + cents;
    signals.push({ type: "amount", weight: 0.15 });
  }

  // 3. ERP status phrase.
  if (ERP_STATUS_RE.test(body)) signals.push({ type: "erp_status", weight: 0.05 });

  // 4. Attachment evidence.
  const evidence: DetectionResult["evidence"] = [];
  for (const a of input.attachments ?? []) {
    evidence.push({ type: "attachment", id: a.id, label: a.filename });
    signals.push({ type: "attachment", weight: 0.1 });
  }

  // 5. Cost center from channel topic/name.
  const cc = (input.channelTopic ?? "").match(/(?:cost\s*center|cc)\s*[:=]\s*([a-z0-9_-]+)/i)?.[1]?.toUpperCase() ?? null;

  // 6. Policy rule lookup by type + amount (+ cost center).
  const topType = [...typeScores.entries()].sort((a, b) => b[1].weight - a[1].weight)[0]?.[0] ?? null;
  let policyRuleId: string | null = null;
  let policyRuleName: string | null = null;
  let thresholdCents: number | null = null;

  if (topType) {
    const rules = await prisma.approvalPolicyRule.findMany({
      where: { workspaceId: input.workspaceId, active: true, requestType: topType },
      orderBy: { priority: "asc" },
    });
    let best: { rule: (typeof rules)[number]; score: number } | null = null;
    for (const rule of rules) {
      let score = 1 / (rule.priority || 10);
      if (rule.minAmountCents != null && amountCents != null && amountCents >= rule.minAmountCents) score += 0.3;
      if (rule.maxAmountCents != null && amountCents != null && amountCents <= rule.maxAmountCents) score += 0.3;
      if (rule.costCenter && cc && rule.costCenter.toUpperCase() === cc) score += 0.4;
      // Rules without amount gating apply to any request of their type.
      if (rule.minAmountCents == null && rule.maxAmountCents == null && rule.costCenter == null) score += 0.5;
      if (!best || score > best.score) best = { rule, score };
    }
    if (best && (best.score >= 0.35 || amountCents != null)) {
      policyRuleId = best.rule.id;
      policyRuleName = best.rule.name;
      thresholdCents = best.rule.maxAmountCents ?? best.rule.minAmountCents ?? null;
      // Threshold violation (amount over rule ceiling) is a strong signal.
      if (amountCents != null && best.rule.maxAmountCents != null && amountCents > best.rule.maxAmountCents) {
        signals.push({ type: "threshold_violation", weight: 0.1 });
      }
    }
  }

  // 7. Confidence = strongest pattern weight + signal bumps.
  const strongest = Math.max(...signals.map((s) => s.weight), 0);
  let confidence = strongest;
  if (amountCents != null && confidence > 0) confidence += 0.15;
  if (policyRuleId && confidence > 0) confidence += 0.1;
  confidence = Math.min(confidence, 0.95);

  if (!topType || confidence < 0.45) return null;

  return {
    requestType: topType,
    confidence,
    amountCents,
    signals,
    policyRuleId,
    policyRuleName,
    thresholdCents,
    costCenter: cc,
    rationale: body,
    evidence,
  };
}