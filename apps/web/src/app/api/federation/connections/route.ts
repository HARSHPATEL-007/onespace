import { auth } from "@n0va/auth";
import { FederationService } from "@n0va/modules-federation/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const svc = new FederationService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try { return NextResponse.json({ connections: await svc.getConnections() }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 }); }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const svc = new FederationService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try { return NextResponse.json(await svc.createConnection({ protocol: body.protocol, remoteDomain: body.remoteDomain, remoteRoomId: body.remoteRoomId, localChannelId: body.localChannelId, trustLevel: body.trustLevel, capabilities: body.capabilities, config: body.config })); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 }); }
}
