import { AppSetService } from "@n0va/modules-appset/server";
import { AppCatalog } from "@n0va/modules-appset/components";
import { requireWorkspace } from "@/lib/context";
import { logLaunchAction } from "./actions";

export default async function AppSetPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new AppSetService(workspaceId, userId, role);
  const apps = await svc.list();

  return <AppCatalog apps={apps} onLaunch={logLaunchAction} />;
}
