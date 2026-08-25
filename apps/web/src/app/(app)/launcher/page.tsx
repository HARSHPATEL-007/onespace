import { moduleEnableMap } from "@n0va/modules-admin/server";
import { requireWorkspace } from "@/lib/context";
import LauncherClient from "./LauncherClient";

export const dynamic = "force-dynamic";

export default async function LauncherPage() {
  const { workspaceId } = await requireWorkspace();
  const enabled = await moduleEnableMap(workspaceId);
  return <LauncherClient enabledMap={enabled} />;
}