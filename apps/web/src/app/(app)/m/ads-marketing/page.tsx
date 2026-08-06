import { CampaignService } from "@n0va/modules-ads-marketing/server";
import { CampaignsBoard } from "@n0va/modules-ads-marketing/components";
import { requireWorkspace } from "@/lib/context";
import { createCampaignAction, setCampaignStatusAction, simulateCampaignAction, removeCampaignAction } from "./actions";

export default async function AdsMarketingPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new CampaignService(workspaceId, userId, role);
  const campaigns = await svc.list();

  return (
    <CampaignsBoard
      campaigns={campaigns}
      actions={{ create: createCampaignAction, setStatus: setCampaignStatusAction, simulate: simulateCampaignAction, remove: removeCampaignAction }}
    />
  );
}
