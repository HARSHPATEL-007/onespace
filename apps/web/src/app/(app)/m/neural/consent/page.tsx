import { NeuralConsentPanel } from "@/components/neural/NeuralConsentPanel";
import { requireWorkspace } from "@/lib/context";

export default async function NeuralConsentPage() {
  await requireWorkspace();
  return <NeuralConsentPanel />;
}
