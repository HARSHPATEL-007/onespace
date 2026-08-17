import { NeuralService } from "@n0va/modules-neural-chat";
import { requireWorkspace } from "@/lib/context";
import { NeuralLabDashboard } from "@/components/neural/NeuralLabDashboard";
import { neuralAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function NeuralPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new NeuralService(workspaceId, userId, role as never);

  const [status, attention, shares, visible, commands, accessLog, research] = await Promise.all([
    svc.neuralStatus().catch(() => null),
    svc.attentionWeights().catch(() => null),
    svc.listShares().catch(() => []),
    svc.visibleShares().catch(() => ({ mine: [], visible: [] })),
    svc.listCommands(20).catch(() => []),
    svc.getAccessLog(25).catch(() => []),
    svc.researchStats().catch(() => null),
  ]);

  return (
    <NeuralLabDashboard
      status={status as never}
      attention={attention as never}
      shares={shares as never}
      visible={visible as never}
      commands={commands as never}
      accessLog={accessLog as never}
      research={research as never}
      action={neuralAction}
    />
  );
}