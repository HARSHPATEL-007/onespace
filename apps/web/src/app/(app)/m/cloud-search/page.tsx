import { CloudSearchService } from "@n0va/modules-cloud-search/server";
import { SearchPanel } from "@n0va/modules-cloud-search/components";
import { requireWorkspace } from "@/lib/context";

export default async function CloudSearchPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new CloudSearchService(workspaceId, userId, role);
  const scopes = await svc.scopes();

  return <SearchPanel initialHits={[]} scopes={scopes} />;
}

