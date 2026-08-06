import { AppScriptService } from "@n0va/modules-appscript/server";
import { ScriptRunner } from "@n0va/modules-appscript/components";
import { requireWorkspace } from "@/lib/context";
import { createScriptAction, updateScriptAction, removeScriptAction, runScriptAction } from "./actions";

export default async function AppScriptPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new AppScriptService(workspaceId, userId, role);
  const scripts = await svc.list();

  return (
    <ScriptRunner
      scripts={scripts}
      actions={{ create: createScriptAction, update: updateScriptAction, remove: removeScriptAction, run: runScriptAction }}
    />
  );
}
