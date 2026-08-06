import { SiteService } from "@n0va/modules-sites/server";
import { SitesList } from "@n0va/modules-sites/components";
import { requireWorkspace } from "@/lib/context";
import { createSiteAction, renameSiteAction, setPublishedAction, removeSiteAction, addSitePageAction, updateSitePageAction, removeSitePageAction, moveSitePageAction } from "./actions";

export default async function SitesPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new SiteService(workspaceId, userId, role);
  const sites = await svc.list();

  return (
    <SitesList
      sites={sites}
      actions={{
        create: createSiteAction,
        rename: renameSiteAction,
        setPublished: setPublishedAction,
        remove: removeSiteAction,
        addPage: addSitePageAction,
        updatePage: updateSitePageAction,
        removePage: removeSitePageAction,
        movePage: moveSitePageAction,
      }}
    />
  );
}
