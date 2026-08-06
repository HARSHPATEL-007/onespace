import { FounderDashboardService } from "@n0va/modules-founder-dashboard/server";
import { FounderDashboard } from "@n0va/modules-founder-dashboard/components";
import { requireWorkspace } from "@/lib/context";

export default async function FounderDashboardPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new FounderDashboardService(workspaceId, userId, role);
  const snapshot = await svc.snapshot();

  return <FounderDashboard snapshot={snapshot} />;
}
