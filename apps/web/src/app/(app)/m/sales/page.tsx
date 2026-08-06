import { SalesService } from "@n0va/modules-sales/server";
import { Pipeline } from "@n0va/modules-sales/components";
import { requireWorkspace } from "@/lib/context";
import { createDealAction, setDealStageAction, removeDealAction } from "./actions";

export default async function SalesPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new SalesService(workspaceId, userId, role);
  const deals = await svc.pipeline();

  return (
    <Pipeline deals={deals} actions={{ create: createDealAction, setStage: setDealStageAction, remove: removeDealAction }} />
  );
}
