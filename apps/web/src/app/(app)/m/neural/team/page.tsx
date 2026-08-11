import { TeamNeuralDashboard } from "@/components/neural/TeamNeuralDashboard";
import { requireWorkspace } from "@/lib/context";

export default async function NeuralTeamPage() {
  await requireWorkspace();
  return (
    <div style={{ padding: "var(--nv-space-5)" }}>
      <TeamNeuralDashboard />
    </div>
  );
}
