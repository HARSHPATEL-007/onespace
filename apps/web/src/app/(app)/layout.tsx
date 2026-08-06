import { redirect } from "next/navigation";
import { auth } from "@n0va/auth";
import { getWorkspaceContext } from "@/lib/context";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/signin");

  return (
    <AppShell
      user={session.user}
      workspaces={ctx.memberships.map((m) => ({ workspace: m.workspace, role: m.role }))}
      activeWorkspace={ctx.workspace}
    >
      {children}
    </AppShell>
  );
}