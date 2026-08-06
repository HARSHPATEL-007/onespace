import { InsightsService } from "@n0va/modules-insights/server";
import { Insights } from "@n0va/modules-insights/components";
import { requireWorkspace } from "@/lib/context";

export default async function InsightsPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new InsightsService(workspaceId, userId, role);
  const [snapshot, activity, audit] = await Promise.all([svc.snapshot(), svc.activity(), svc.recentAudit()]);

  return <Insights snapshot={snapshot} activity={activity} audit={audit} />;
}
