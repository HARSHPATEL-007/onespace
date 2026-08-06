import { notFound } from "next/navigation";
import { SiteService } from "@n0va/modules-sites/server";
import { SitePreview } from "@n0va/modules-sites/components";
import { requireWorkspace } from "@/lib/context";

export default async function SitePreviewPage({ params }: { params: Promise<{ id: string }> }) {
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

  return <SitePreview site={site} />;
}
