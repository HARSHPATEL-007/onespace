import { getWorkspaceContext } from "./context";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function actionContext() {
  const ctx = await getWorkspaceContext();
  if (!ctx) throw new UnauthorizedError();
  return { workspaceId: ctx.workspace.id, userId: ctx.user.id, role: ctx.memberRole };
}

export async function requireActionContext() {
  const ctx = await getWorkspaceContext();
  if (!ctx) throw new UnauthorizedError();
  return ctx;
}