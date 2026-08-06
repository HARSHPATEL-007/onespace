import { notFound } from "next/navigation";
import { ModulePlaceholder } from "@n0va/ui";
import { N0VA_MODULE_MAP } from "@n0va/core";

export const dynamic = "force-dynamic";

const PHASE_LABELS: Record<number, string> = {
  0: "Foundation — shell online",
  1: "Core — build in progress",
  2: "Phase 2 — planned",
  3: "Phase 3 — planned",
  4: "Phase 4 — planned",
};

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module: id } = await params;
  const module_ = N0VA_MODULE_MAP[id];
  if (!module_) notFound();

  return <ModulePlaceholder module={module_} phaseLabel={PHASE_LABELS[module_.phase] ?? "planned"} />;
}