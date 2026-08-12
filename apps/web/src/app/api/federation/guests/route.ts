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
  try { return NextResponse.json({ guests: await svc.getGuests() }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 }); }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const svc = new FederationService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try { return NextResponse.json(await svc.inviteGuest({ guestEmail: body.guestEmail, guestName: body.guestName, accessTier: body.accessTier ?? "VIEWER", roomScope: body.roomScope, expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined })); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 }); }
}
