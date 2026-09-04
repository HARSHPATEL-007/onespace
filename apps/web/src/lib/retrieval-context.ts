import { auth } from "@n0va/auth";
import { getWorkspaceContext } from "@/lib/context";
import { HybridRetrievalService } from "@n0va/modules-booklm/retrieval";
import { globalQueryStore } from "@n0va/modules-booklm/retrieval-deep";

export { globalQueryStore };

export async function retrievalContext() {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" as const, status: 401 };
  const c = await getWorkspaceContext().catch(() => null);
  if (!c) return { error: "No workspace" as const, status: 400 };
  const svc = new HybridRetrievalService(c.workspaceId, c.userId, c.memberRole ?? "member");
  const acl = {
    userId: c.userId,
    enrollments: [],
    institutionId: undefined as string | undefined,
    role: (c.memberRole ?? "member").toLowerCase(),
  };
  return { ctx: c, svc, acl };
}
