import { DrawingsService } from "@n0va/modules-drawings/server";
import { DrawingsList } from "@n0va/modules-drawings/components";
import { requireWorkspace } from "@/lib/context";
import { createDrawingAction, renameDrawingAction, deleteDrawingAction, saveCanvasAction } from "./actions";

export default async function DrawingsPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new DrawingsService(workspaceId, userId, role);
  const drawings = await svc.list();

  return (
    <DrawingsList
      drawings={drawings}
      actions={{
        create: createDrawingAction,
        rename: renameDrawingAction,
        remove: deleteDrawingAction,
        saveCanvas: saveCanvasAction,
      }}
    />
  );
}
