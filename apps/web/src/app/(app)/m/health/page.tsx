import { HealthService } from "@n0va/modules-health/server";
import { WellnessBoard } from "@n0va/modules-health/components";
import { requireWorkspace } from "@/lib/context";
import { createCheckinAction, removeCheckinAction } from "./actions";

export default async function HealthPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new HealthService(workspaceId, userId, role);
  const [checkins, stats] = await Promise.all([svc.checkins(), svc.stats()]);

  return <WellnessBoard checkins={checkins} stats={stats} actions={{ create: createCheckinAction, remove: removeCheckinAction }} />;
}
