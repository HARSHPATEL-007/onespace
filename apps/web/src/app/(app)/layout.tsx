import { redirect } from "next/navigation";
import { auth } from "@n0va/auth";
import { N0VA_MODULES } from "@n0va/core";
import { getWorkspaceContext } from "@/lib/context";
import { AppShell } from "@/components/AppShell";
import { moduleEnableMap } from "@n0va/modules-admin/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/signin");

  const enabled = await moduleEnableMap(ctx.workspaceId);
  const enabledModuleIds = N0VA_MODULES.filter((m) => enabled[m.id] !== false).map((m) => m.id);

  return (
    <AppShell
      user={session.user}
      workspaces={ctx.memberships.map((m) => ({ workspace: m.workspace, role: m.role }))}
      activeWorkspace={ctx.workspace}
      enabledModuleIds={enabledModuleIds}
    >
      {children}
    </AppShell>
  );
}