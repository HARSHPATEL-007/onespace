import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { WORKSPACE_COOKIE } from "@n0va/core";

export async function getWorkspaceContext() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: session.user.id, status: "ACTIVE" },
    include: { workspace: true },
    orderBy: { joinedAt: "asc" },
  });

  if (memberships.length === 0) return null;

  const cookieStore = await cookies();
  const requested = cookieStore.get(WORKSPACE_COOKIE)?.value;
  const active = memberships.find((m) => m.workspaceId === requested) ?? memberships[0]!;

  return {
    user: session.user,
    memberships,
    workspace: active.workspace,
    workspaceId: active.workspaceId,
    userId: session.user.id,
    role: active.role,
    memberRole: active.role,
  };
}

export async function requireWorkspace() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/signin");
  return ctx;
}