import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService } from "@n0va/modules-health/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const modelId = searchParams.get("modelId");
  const version = searchParams.get("version") ?? "1.0.0";
  if (!modelId) return NextResponse.json({ error: "modelId required" }, { status: 400 });
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try {
    const result = await svc.registryCanOperate(modelId, version, {
      jurisdiction: searchParams.get("jurisdiction") ?? undefined,
      population: searchParams.get("population") ?? undefined,
      modality: searchParams.get("modality") ?? undefined,
      careSetting: searchParams.get("careSetting") ?? undefined,
      actionClass: searchParams.get("actionClass") ?? undefined,
      policyVersion: searchParams.get("policyVersion") ?? undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const url = new URL(req.url);
  Object.entries(body).forEach(([k,v])=> { if(v!=null) url.searchParams.set(k, String(v)); });
  // delegate to GET
  const fakeReq = new Request(url.toString(), { method: "GET" });
  // @ts-ignore
  return GET(fakeReq);
}
