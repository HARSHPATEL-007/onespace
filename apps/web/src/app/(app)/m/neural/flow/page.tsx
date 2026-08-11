import { FlowModePanel } from "@/components/neural/FlowModePanel";
import { requireWorkspace } from "@/lib/context";

export default async function NeuralFlowPage() {
  await requireWorkspace();
  return (
    <div style={{ padding: "var(--nv-space-5)" }}>
      <FlowModePanel />
    </div>
  );
}
