import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";
import { suggestFromWorkspace, storeSuggestion } from "@n0va/modules-chat";

/**
 * Inference-based auto-suggested state transitions (spec build order step 7).
 * Inference is supportive, never authoritative: this endpoint returns a
 * suggestion and persists it — it never switches the active mode.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const suggestion = await suggestFromWorkspace({ userId: ctx.user.id, workspaceId: ctx.workspace.id });
  await storeSuggestion(ctx.user.id, ctx.workspace.id, suggestion);
  return NextResponse.json({ suggestion });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  // Optional client-supplied signals (e.g. from a neural flow panel) extend
  // the server-side signal gather.
  const suggestion = await suggestFromWorkspace({ userId: ctx.user.id, workspaceId: ctx.workspace.id });
  const merged = {
    mode: suggestion.mode,
    confidence: suggestion.confidence,
    reasons: suggestion.reasons,
    ...(body.signal ? { clientSignals: body.signal } : {}),
  };
  await storeSuggestion(ctx.user.id, ctx.workspace.id, suggestion);
  return NextResponse.json({ suggestion: merged });
}