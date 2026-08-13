import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";
import {
  getEffectiveState,
  getStoredState,
  setExplicitMode,
  revertToInferred,
  isWorkspaceModeValue,
  parseOverrides,
  MODES,
  MODE_ORDER,
  type ModeSource,
} from "@n0va/modules-chat";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const effective = await getEffectiveState(ctx.user.id, ctx.workspace.id);
  const stored = await import("@n0va/modules-chat").then((m) => m.getStoredState(ctx.user.id, ctx.workspace.id));

  return NextResponse.json({
    effective,
    stored: {
      currentMode: stored.currentMode,
      stateSource: stored.stateSource,
      stateConfidence: stored.stateConfidence,
      expiresAt: stored.expiresAt,
      modeOverrides: stored.modeOverrides,
      suggestedMode: stored.suggestedMode,
      suggestedConfidence: stored.suggestedConfidence,
      suggestedAt: stored.suggestedAt,
      suggestedReasons: stored.suggestedReasons,
    },
    modes: MODE_ORDER.map((m) => ({ key: m, label: MODES[m].label, icon: MODES[m].icon })),
  });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const mode = body.mode;
  if (!isWorkspaceModeValue(mode)) {
    return NextResponse.json({ error: `mode must be one of: ${MODE_ORDER.join(", ")}` }, { status: 400 });
  }

  const source: ModeSource = body.source === "locked" ? "locked" : "manual";
  let expiresAt: Date | null = null;
  if (body.expiresAt) {
    const d = new Date(body.expiresAt);
    if (isNaN(d.getTime())) return NextResponse.json({ error: "invalid expiresAt" }, { status: 400 });
    expiresAt = d;
  } else if (body.lockMinutes) {
    expiresAt = new Date(Date.now() + Number(body.lockMinutes) * 60 * 1000);
  }

  const stored = await setExplicitMode(ctx.user.id, ctx.workspace.id, mode, {
    source,
    expiresAt,
    overrides: parseOverrides(body.overrides),
  });
  const effective = await getEffectiveState(ctx.user.id, ctx.workspace.id);
  return NextResponse.json({ stored, effective });
}

/** One-click revert: drop explicit mode, fall back to inferred/default. */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const stored = await revertToInferred(ctx.user.id, ctx.workspace.id);
  const effective = await getEffectiveState(ctx.user.id, ctx.workspace.id);
  return NextResponse.json({ stored, effective });
}