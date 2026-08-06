import { notFound } from "next/navigation";
import { DrawingsService } from "@n0va/modules-drawings/server";
import { CanvasEditor } from "@n0va/modules-drawings/components";
import { requireWorkspace } from "@/lib/context";
import { renameDrawingAction, saveCanvasAction } from "../actions";

export default async function DrawingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new DrawingsService(workspaceId, userId, role);

  let drawing;
  try {
    drawing = await svc.get(id);
  } catch {
    notFound();
  }

  return (
    <CanvasEditor
      drawing={drawing}
      actions={{
        rename: renameDrawingAction,
        saveCanvas: saveCanvasAction,
      }}
    />
  );
}
