"use server";

import { HybridRetrievalService } from "@n0va/modules-booklm/retrieval";
import { evaluateRetrievalDeep, globalQueryStore } from "@n0va/modules-booklm/retrieval-deep";
import { actionContext } from "@/lib/action-context";

/**
 * N0VA BOOKLM EDUCATION — Hybrid Retrieval server actions.
 * Thin wrappers over HybridRetrievalService + the query store so the
 * BookLM pages can run plan → query → evidence → feedback without
 * hand-rolling fetch calls. Permission filtering stays inside the service
 * (query time) and the API route (render time).
 */

const retrievalSvc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  const svc = new HybridRetrievalService(workspaceId, userId, role);
  const acl = {
    userId,
    enrollments: [] as string[],
    institutionId: undefined as string | undefined,
    role: String(role ?? "member").toLowerCase(),
  };
  return { svc, acl, workspaceId, userId };
};

export async function getRetrievalPlanAction(query: string) {
  const { svc } = await retrievalSvc();
  return svc.explainPlan(query);
}

export async function runRetrievalQueryAction(input: unknown) {
  const { svc, acl, workspaceId } = await retrievalSvc();
  const result = await svc.query(input, acl);
  globalQueryStore.save({
    queryId: result.query_id,
    workspaceId,
    query: typeof (input as { query?: unknown })?.query === "string" ? String((input as { query: string }).query) : "",
    cards: result.results,
    explanation: result.explanation,
    federatedUnavailable: result.federated_unavailable,
    acl: {
      userId: acl.userId,
      enrollments: acl.enrollments,
      institutionId: acl.institutionId,
      role: acl.role,
    },
    units: result.units,
  });
  return result;
}

export async function getRetrievalEvidenceAction(queryId: string) {
  const stored = globalQueryStore.get(queryId);
  if (!stored) return null;
  const { workspaceId } = await actionContext();
  if (stored.workspaceId !== workspaceId) return null;
  return stored;
}

export async function submitRetrievalFeedbackAction(queryId: string, unitId: string, verdict: "correct" | "incorrect", note = "") {
  return globalQueryStore.addFeedback(queryId, unitId, verdict, note);
}

export async function runRetrievalEvalAction(input: {
  relevant: string[];
  retrieved: string[];
  k?: number;
  citedIds?: string[];
  permissionLeaks?: number;
  staleCount?: number;
  duplicateCount?: number;
}) {
  return evaluateRetrievalDeep({
    relevant: new Set(input.relevant),
    retrieved: input.retrieved,
    k: input.k,
    citedIds: new Set(input.citedIds ?? []),
    permissionLeaks: input.permissionLeaks ?? 0,
    staleCount: input.staleCount ?? 0,
    duplicateCount: input.duplicateCount ?? 0,
  });
}
