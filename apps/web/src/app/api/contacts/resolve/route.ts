import { auth } from "@n0va/auth";
import { ContactChatService } from "@n0va/modules-contacts/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, role } = await requireWorkspace().catch(() => ({ workspaceId: null, role: null }));
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const identifier: string | undefined = body.identifier;

  if (!identifier || typeof identifier !== "string") {
    return NextResponse.json({ error: "Identifier is required" }, { status: 400 });
  }

  const svc = new ContactChatService(workspaceId, session.user.id, role ?? "MEMBER");

  try {
    const result = await svc.resolveContact(identifier);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to resolve contact" },
      { status: 500 },
    );
  }
}
