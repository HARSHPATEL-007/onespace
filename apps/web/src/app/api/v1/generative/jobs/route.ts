import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { project_id, mode, prompt_id, reference_assets, model_id, output_profile, policy_profile, processing_location } = body;
  if (!project_id) return NextResponse.json({ error: "project_id required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const job = await svc.generativeCreateJob({ project_id: String(project_id), mode: mode ? String(mode) : "text_to_video", prompt_id: prompt_id ? String(prompt_id) : undefined, prompt: body.prompt ? String(body.prompt) : undefined, reference_assets: reference_assets ? (reference_assets as string[]).map(String) : undefined, model_id: model_id ? String(model_id) : undefined, output_profile: output_profile ? String(output_profile) : undefined, policy_profile: policy_profile ? String(policy_profile) : undefined, processing_location: processing_location ? String(processing_location) : undefined });
  return NextResponse.json(job);
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const jobs = await svc.generativeListJobs();
  return NextResponse.json(jobs);
}
