import { getDeliveryEngine, listPolicies, matrixRows, breakerStates, quotaState, listDlq } from "@n0va/modules-chat/delivery";
import { requireWorkspace } from "@/lib/context";
import { DeliveryDashboard } from "@/components/delivery/DeliveryDashboard";
import { deliveryAction } from "../chat/actions";

export const dynamic = "force-dynamic";

export default async function DeliveryPage() {
  const { workspaceId, role } = await requireWorkspace();
  const engine = getDeliveryEngine();

  const [stats, policies, matrix, breakers, quota, dlq, recent] = await Promise.all([
    engine.stats(workspaceId),
    listPolicies(workspaceId),
    matrixRows(),
    breakerStates(workspaceId),
    quotaState(workspaceId),
    listDlq(workspaceId),
    engine.deliveries(workspaceId, undefined, undefined, 25),
  ]);

  return (
    <DeliveryDashboard
      role={role}
      stats={stats}
      policies={policies}
      matrix={matrix}
      breakers={breakers}
      quota={quota}
      dlq={dlq}
      recent={recent}
      action={deliveryAction}
    />
  );
}