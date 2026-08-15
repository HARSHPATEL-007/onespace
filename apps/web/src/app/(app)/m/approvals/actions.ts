"use server";

import { ApprovalService } from "@n0va/modules-approvals/server";
import { actionContext } from "@/lib/action-context";

async function svc() {
  const ctx = await actionContext();
  return new ApprovalService(ctx.workspaceId, ctx.userId, ctx.role);
}

export interface ApprovalAdminInput {
  op: "decide" | "forceSync" | "cancel" | "createPolicy" | "updatePolicy" | "deletePolicy" | "setConfig";
  approvalId?: string;
  decision?: string;
  note?: string;
  ruleId?: string;
  input?: Record<string, unknown>;
}

export async function approvalAdminAction(input: ApprovalAdminInput) {
  const s = await svc();
  switch (input.op) {
    case "decide":
      return s.decide(input.approvalId!, input.decision!, input.note);
    case "forceSync":
      return s.forceSync(input.approvalId!);
    case "cancel":
      return s.cancel(input.approvalId!, input.note);
    case "createPolicy":
      return s.createPolicy(input.input as never);
    case "updatePolicy":
      return s.updatePolicy(input.ruleId!, input.input ?? {});
    case "deletePolicy":
      return s.deletePolicy(input.ruleId!);
    case "setConfig":
      return s.setConfig(input.input ?? {});
    default:
      throw new Error("Unknown approval admin op");
  }
}