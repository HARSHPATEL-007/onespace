import { BusinessDashboardService } from "@n0va/modules-business-dashboard/server";
import { BusinessDashboard } from "@n0va/modules-business-dashboard/components";
import { requireWorkspace } from "@/lib/context";

export default async function BusinessDashboardPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new BusinessDashboardService(workspaceId, userId, role);
  const snapshot = await svc.snapshot();

  return <BusinessDashboard snapshot={snapshot} />;
}
