import { prisma } from "@n0va/db";
import { DECISION, ERP_PROVIDERS, REQUEST_TYPES } from "./constants";
import { randomBytes } from "node:crypto";

export interface ErpWriteInput {
  approvalId: string;
  requestType: string;
  decision: string;
  workspaceId: string;
  requesterId: string;
  requesterName?: string | null;
  amountCents?: number | null;
  currency: string;
  rationale?: string | null;
  evidence: Array<{ type: string; id: string; label: string }>;
}

export interface ErpWriteResult {
  ok: boolean;
  erpReference?: string;
  error?: string;
}

/** System-of-record port. MOCK runs in-app; XERO/QUICKBOOKS hit real connectors. */
export interface ErpAdapter {
  readonly provider: string;
  writeDecision(input: ErpWriteInput): Promise<ErpWriteResult>;
}

const shortId = (prefix: string) => `${prefix}-${randomBytes(4).toString("hex")}`;

async function nextPoNumber(workspaceId: string): Promise<string> {
  const count = await prisma.purchaseOrder.count({ where: { workspaceId } });
  return `PO-${String(count + 1).padStart(4, "0")}`;
}

/** In-app deterministic ERP. Approved → PO released / payment scheduled. */
export class MockErpAdapter implements ErpAdapter {
  readonly provider = ERP_PROVIDERS.MOCK;

  async writeDecision(input: ErpWriteInput): Promise<ErpWriteResult> {
    if (input.decision === DECISION.REJECTED) return { ok: true };
    if (process.env.N0VA_MOCK_ERP_FAIL === "1" || /\[simulate-erp-failure\]/i.test(input.rationale ?? "")) {
      throw new Error("Mock ERP unavailable (injected failure)");
    }

    switch (input.requestType) {
      case REQUEST_TYPES.PO_APPROVAL: {
        const poNumber = await nextPoNumber(input.workspaceId);
        const vendor = extractVendor(input.rationale ?? "") ?? "Unknown vendor";
        const po = await prisma.purchaseOrder.create({
          data: {
            workspaceId: input.workspaceId,
            poNumber,
            vendorName: vendor,
            description: (input.rationale ?? "").slice(0, 500) || null,
            amountCents: input.amountCents ?? 0,
            currency: input.currency,
            status: "RELEASED",
            approvalId: input.approvalId,
            requestedById: input.requesterId,
            approvedById: input.requesterId,
            approvedAt: new Date(),
            releasedAt: new Date(),
          },
        });
        await prisma.paymentSchedule.create({
          data: {
            workspaceId: input.workspaceId,
            poId: po.id,
            approvalId: input.approvalId,
            amountCents: po.amountCents,
            currency: po.currency,
            status: "SCHEDULED",
          },
        });
        return { ok: true, erpReference: poNumber };
      }
      case REQUEST_TYPES.INVOICE_APPROVAL:
      case REQUEST_TYPES.EXPENSE_APPROVAL:
      case REQUEST_TYPES.PAYMENT_RELEASE: {
        const invoiceId = input.evidence.find((e) => e.type === "erp_tx")?.id ?? null;
        const ps = await prisma.paymentSchedule.create({
          data: {
            workspaceId: input.workspaceId,
            invoiceId,
            approvalId: input.approvalId,
            amountCents: input.amountCents ?? 0,
            currency: input.currency,
            status: "SCHEDULED",
          },
        });
        return { ok: true, erpReference: `PAY-${ps.id.slice(0, 8)}` };
      }
      case REQUEST_TYPES.VENDOR_ONBOARDING:
        return { ok: true, erpReference: shortId("VND") };
      case REQUEST_TYPES.ACCESS_REQUEST:
        return { ok: true, erpReference: shortId("ACS") };
      case REQUEST_TYPES.BUDGET_EXCEPTION:
      case REQUEST_TYPES.JOURNAL_ENTRY:
      case REQUEST_TYPES.GENERAL:
      default:
        return { ok: true, erpReference: shortId("ERP") };
    }
  }
}

const VENDOR_RE = /(?:vendor|supplier)\s*(?:is|:)?\s*["']?([A-Za-z0-9 _.-]{2,40})/i;
function extractVendor(rationale: string): string | null {
  const m = rationale.match(VENDOR_RE);
  return m?.[1]?.trim() ?? null;
}

/** Real ERP write-back via the n0va1o gateway (Xero / QuickBooks connectors). */
export class N0va1oErpAdapter implements ErpAdapter {
  constructor(
    readonly provider: string,
    private readonly integrationId: string,
  ) {}

  async writeDecision(input: ErpWriteInput): Promise<ErpWriteResult> {
    const integration = await prisma.integration.findFirst({
      where: { id: this.integrationId, workspaceId: input.workspaceId, enabled: true },
    });
    if (!integration) throw new Error("ERP integration not configured or disabled");

    const { N0va1oGateway } = await import("@n0va/modules-n0va1o/gateway");
    const gateway = new N0va1oGateway();
    const tool = this.provider === ERP_PROVIDERS.XERO ? "xero:create_invoice" : "quickbooks:create_invoice";
    const res = await gateway.call({
      integration,
      workspaceId: input.workspaceId,
      userId: input.requesterId,
      actorLabel: input.requesterName ?? "approval-system",
      tool,
      input: {
        number: input.approvalId.slice(0, 8).toUpperCase(),
        amount: (input.amountCents ?? 0) / 100,
        currency: input.currency,
        reference: input.approvalId,
      },
      skipPolicyCheck: true,
    });
    if (!res.ok) throw new Error(`ERP write-back failed (${res.statusCode}): ${res.message}`);
    return { ok: true, erpReference: `ERP-${res.idempotencyKey.slice(0, 8)}` };
  }
}

export function erpAdapterFor(config: { erpProvider: string; erpIntegrationId?: string | null }): ErpAdapter {
  if (config.erpProvider === ERP_PROVIDERS.XERO || config.erpProvider === ERP_PROVIDERS.QUICKBOOKS) {
    if (!config.erpIntegrationId) throw new Error("ERP integration not configured");
    return new N0va1oErpAdapter(config.erpProvider, config.erpIntegrationId);
  }
  return new MockErpAdapter();
}

export async function getConfig(workspaceId: string) {
  const existing = await prisma.workspaceApprovalConfig.findUnique({ where: { workspaceId } });
  if (existing) return existing;
  return prisma.workspaceApprovalConfig.create({
    data: { workspaceId, erpProvider: ERP_PROVIDERS.MOCK },
  });
}