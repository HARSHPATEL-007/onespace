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

  if (!body.firstName) {
    return NextResponse.json({ error: "firstName is required" }, { status: 400 });
  }

  const svc = new ContactChatService(workspaceId, session.user.id, role ?? "MEMBER");

  try {
    const contact = await svc.saveContact({
      firstName: body.firstName,
      lastName: body.lastName ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      company: body.company ?? null,
      title: body.title ?? null,
      notes: body.notes ?? null,
      labels: body.labels ?? [],
      n0vachatId: body.n0vachatId ?? null,
      username: body.username ?? null,
      address: body.address ?? null,
      website: body.website ?? null,
      platform: body.platform ?? "N0VA",
    });
    return NextResponse.json(contact);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save contact" },
      { status: 500 },
    );
  }
}
