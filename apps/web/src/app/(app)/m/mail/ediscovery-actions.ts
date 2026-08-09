"use server";

import { MailService } from "@n0va/modules-mail/server";
import { requireWorkspace } from "@/lib/context";

async function svc() {
  const { workspaceId, userId, role } = await requireWorkspace();
  return new MailService(workspaceId, userId, role);
}

// ── eDiscovery: Legal Holds ─────────────────────────────────

export async function createLegalHoldAction(formData: FormData) {
  const s = await svc();
  const users = (formData.get("users") as string || "").split(",").map(u => u.trim()).filter(Boolean);
  const keywords = (formData.get("keywords") as string || "").split(",").map(k => k.trim()).filter(Boolean);
  return s.createLegalHold({
    name: formData.get("name") as string,
    description: formData.get("description") as string as string,
    createdBy: s["userId"],
    users,
    dateRange: {
      start: new Date(formData.get("dateStart") as string),
      end: new Date(formData.get("dateEnd") as string),
    },
    keywords,
  });
}

export async function releaseLegalHoldAction(formData: FormData) {
  const s = await svc();
  return s.releaseLegalHold(
    formData.get("holdId") as string,
    s["userId"],
  );
}

// ── eDiscovery: Retention Policies ──────────────────────────

export async function createRetentionPolicyAction(formData: FormData) {
  const s = await svc();
  return s.createRetentionPolicy({
    name: formData.get("name") as string,
    retentionPeriodDays: Number(formData.get("retentionPeriodDays") || 365),
    action: formData.get("action") as string,
    applyTo: formData.get("applyTo") as string,
    target: formData.get("target") as string || undefined,
  });
}

export async function applyRetentionPoliciesAction() {
  const s = await svc();
  return s.applyRetentionPolicies();
}

// ── eDiscovery: Discovery Searches ──────────────────────────

export async function createDiscoverySearchAction(formData: FormData) {
  const s = await svc();
  const senders = (formData.get("senders") as string || "").split(",").map(e => e.trim()).filter(Boolean);
  const folders = (formData.get("folders") as string || "").split(",").map(f => f.trim()).filter(Boolean);
  return s.createDiscoverySearch({
    name: formData.get("name") as string,
    query: formData.get("query") as string,
    senders: senders.length > 0 ? senders : undefined,
    folders: folders.length > 0 ? folders : undefined,
  });
}

export async function runDiscoverySearchAction(formData: FormData) {
  const s = await svc();
  return s.runDiscoverySearch(formData.get("searchId") as string);
}

// ── N0VA1O Agent Actions ────────────────────────────────────

export async function executeAgentWorkflowAction(formData: FormData) {
  const { workspaceId, userId } = await requireWorkspace();
  const { mailAgentWorkflows } = await import("@n0va/modules-mail");
  const persona = formData.get("persona") as any || "mail_concierge";
  const workflowId = formData.get("workflowId") as string;

  if (workflowId) {
    return mailAgentWorkflows.executeWorkflow(workflowId, {
      workspaceId,
      userId,
      persona,
      autonomyLevel: "high",
    });
  }

  // Create and execute a persona-based workflow
  let workflow;
  switch (persona) {
    case "mail_concierge":
      workflow = mailAgentWorkflows.createInboundProcessingWorkflow();
      break;
    case "executive_brief":
      workflow = mailAgentWorkflows.createExecutiveDigestWorkflow();
      break;
    default:
      workflow = mailAgentWorkflows.createInboundProcessingWorkflow();
  }

  return mailAgentWorkflows.executeWorkflow(workflow.id, {
    workspaceId,
    userId,
    persona,
    autonomyLevel: "high",
  });
}
