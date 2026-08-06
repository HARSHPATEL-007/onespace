import { notFound } from "next/navigation";
import { SlidesService } from "@n0va/modules-slides/server";
import { SlidesEditor } from "@n0va/modules-slides/components";
import { requireWorkspace } from "@/lib/context";
import {
  renamePresentationAction,
  setThemeAction,
  addSlideAction,
  saveSlideBlocksAction,
  deleteSlideAction,
  moveSlideAction,
} from "../actions";

export default async function PresentationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new SlidesService(workspaceId, userId, role);

  let presentation;
  try {
    presentation = await svc.get(id);
  } catch {
    notFound();
  }

  return (
    <SlidesEditor
      presentation={presentation}
      slides={presentation.slides}
      actions={{
        rename: renamePresentationAction,
        setTheme: setThemeAction,
        addSlide: addSlideAction,
        saveBlocks: saveSlideBlocksAction,
        removeSlide: deleteSlideAction,
        moveSlide: moveSlideAction,
      }}
    />
  );
}
