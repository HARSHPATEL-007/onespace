import { WellbeingService } from "@n0va/modules-wellbeing/server";
import { requireWorkspace } from "@/lib/context";
import { WellbeingClient } from "./WellbeingClient";

export const metadata = { title: "N0VA Well-Being Observatory" };

export default async function WellbeingPage() {
  const ctx = await requireWorkspace();
  const svc = new WellbeingService(ctx.workspaceId, ctx.userId, ctx.memberRole);
  const overview = await svc.getOverview();
  return <WellbeingClient initial={overview} />;
}