import { NextResponse } from "next/server";
import { actionContext } from "@/lib/action-context";
import { getMailEngine } from "@n0va/modules-mail";

/**
 * POST /api/mail/sync
 * Trigger IMAP sync for the workspace.
 */
export async function POST() {
  try {
    const { workspaceId } = await actionContext();
    const engine = getMailEngine(workspaceId);
    const result = await engine.syncInbox();

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { success: false, count: 0, error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
