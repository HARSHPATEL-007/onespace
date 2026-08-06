import { RevenueService } from "@n0va/modules-revenue/server";
import { RevenueBoard } from "@n0va/modules-revenue/components";
import { requireWorkspace } from "@/lib/context";
import { createSubscriptionAction, setSubscriptionStatusAction, removeSubscriptionAction, recordPaymentAction, removePaymentAction } from "./actions";

export default async function RevenuePage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new RevenueService(workspaceId, userId, role);
  const data = await svc.overview();

  return (
    <RevenueBoard
      data={data}
      actions={{
        createSubscription: createSubscriptionAction,
        setSubscriptionStatus: setSubscriptionStatusAction,
        removeSubscription: removeSubscriptionAction,
        recordPayment: recordPaymentAction,
        removePayment: removePaymentAction,
      }}
    />
  );
}
