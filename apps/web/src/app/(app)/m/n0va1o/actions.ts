"use server";

import { N0va1oService, integrationSchema } from "@n0va/modules-n0va1o/server";
import type { IntegrationLog } from "@n0va/db";
import type { AccessRequestView } from "@n0va/modules-n0va1o/components";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new N0va1oService(workspaceId, userId, role);
};

export async function connectIntegrationAction(formData: FormData) {
  const parsed = integrationSchema.parse({
    provider: String(formData.get("provider") ?? "custom"),
    name: String(formData.get("name") ?? ""),
    token: String(formData.get("token") ?? ""),
    baseUrl: String(formData.get("baseUrl") ?? ""),
    mcpEnabled: formData.get("mcpEnabled") === "1",
  });
  await (await svc()).connect(parsed);
}

export async function syncIntegrationAction(formData: FormData) {
  const service = await svc();
  const tool = String(formData.get("tool") ?? "sync");
  return service.sync(String(formData.get("id") ?? ""), tool);
}

export async function toggleIntegrationAction(formData: FormData) {
  await (await svc()).toggle(String(formData.get("id") ?? ""), formData.get("enabled") === "true");
}

export async function removeIntegrationAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("id") ?? ""));
}

export async function integrationActivityAction(formData: FormData): Promise<IntegrationLog[]> {
  return (await svc()).activity(String(formData.get("id") ?? ""));
}

export async function updateIntegrationAction(formData: FormData) {
  const booleans = (v: FormDataEntryValue | null) => v === "on" || v === "1";
  const num = (v: FormDataEntryValue | null, fallback: number) => {
    const n = parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : fallback;
  };
  const csv = (v: FormDataEntryValue | null) =>
    String(v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  await (await svc()).update(String(formData.get("id") ?? ""), {
    name: String(formData.get("name") ?? ""),
    mcpEnabled: booleans(formData.get("mcpEnabled")),
    webhookEnabled: booleans(formData.get("webhookEnabled")),
    rateLimitPerMin: num(formData.get("rateLimitPerMin"), 120),
    retryMax: num(formData.get("retryMax"), 3),
    timeoutMs: num(formData.get("timeoutMs"), 15000),
    allowlistTools: csv(formData.get("allowlistTools")),
    blocklistTools: csv(formData.get("blocklistTools")),
  });
}

export async function rotateWebhookAction(formData: FormData) {
  return (await svc()).rotateWebhook(String(formData.get("id") ?? ""));
}

export async function setRetentionAction(formData: FormData) {
  const days = parseInt(String(formData.get("days") ?? "90"), 10);
  await (await svc()).setRetention(Number.isFinite(days) ? days : 90);
}

export async function rotateMcpKeyAction(): Promise<string> {
  return (await svc()).rotateMcpKey();
}

export async function cleanupLogsAction(): Promise<{ purged: number }> {
  return (await svc()).purgeExpired();
}

export async function accessRequestsAction(): Promise<AccessRequestView[]> {
  return (await svc()).accessRequests();
}

export async function decideAccessAction(formData: FormData) {
  await (await svc()).decideAccess(
    String(formData.get("id") ?? ""),
    formData.get("approve") === "true",
    String(formData.get("signature") || ""),
  );
}

export async function discoverToolsAction(formData: FormData) {
  const service = await svc();
  return service.discoverTools(String(formData.get("query") ?? ""), parseInt(String(formData.get("maxTools") ?? "5"), 10));
}