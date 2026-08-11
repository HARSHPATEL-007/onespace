import { auth } from "@n0va/auth";
import { ContactService } from "@n0va/modules-contacts/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, role } = await requireWorkspace().catch(() => ({ workspaceId: null, role: null }));
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10", 10), 50);

  const svc = new ContactService(workspaceId, session.user.id, role ?? "MEMBER");

  try {
    const contacts = await svc.list({ search: q });
    return NextResponse.json({ contacts: contacts.slice(0, limit) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Search failed" },
      { status: 500 },
    );
  }
}
