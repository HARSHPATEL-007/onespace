import { notFound } from "next/navigation";
import { SiteService } from "@n0va/modules-sites/server";
import { SiteBuilder } from "@n0va/modules-sites/components";
import { requireWorkspace } from "@/lib/context";
import { renameSiteAction, setPublishedAction, addSitePageAction, updateSitePageAction, removeSitePageAction, moveSitePageAction } from "../actions";

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new SiteService(workspaceId, userId, role);

  let site;
  try {
    site = await svc.get(id);
  } catch {
    notFound();
  }
  if (!site) notFound();

  return (
    <SiteBuilder
      site={site}
      actions={{
        rename: renameSiteAction,
        setPublished: setPublishedAction,
        addPage: addSitePageAction,
        updatePage: updateSitePageAction,
        removePage: removeSitePageAction,
        movePage: moveSitePageAction,
      }}
    />
  );
}
