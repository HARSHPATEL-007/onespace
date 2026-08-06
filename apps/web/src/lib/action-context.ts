import { getWorkspaceContext } from "./context";

export async function actionContext() {
  const ctx = await getWorkspaceContext();
  if (!ctx) throw new Error("Unauthorized");
  return { workspaceId: ctx.workspace.id, userId: ctx.user.id, role: ctx.memberRole };
}

export async function requireActionContext() {
  const ctx = await getWorkspaceContext();
  if (!ctx) throw new Error("Unauthorized");
  return { workspaceId: ctx.workspace.id, userId: ctx.user.id, role: ctx.memberRole };
}