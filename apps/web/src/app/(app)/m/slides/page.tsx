import { SlidesService } from "@n0va/modules-slides/server";
import { SlidesList } from "@n0va/modules-slides/components";
import { requireWorkspace } from "@/lib/context";
import {
  createPresentationAction,
  renamePresentationAction,
  setThemeAction,
  deletePresentationAction,
  addSlideAction,
  saveSlideBlocksAction,
  saveSlideNotesAction,
  deleteSlideAction,
  moveSlideAction,
} from "./actions";

export default async function SlidesPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new SlidesService(workspaceId, userId, role);
  const presentations = await svc.list();

  return (
    <SlidesList
      presentations={presentations}
      actions={{
        create: createPresentationAction,
        rename: renamePresentationAction,
        remove: deletePresentationAction,
        addSlide: addSlideAction,
        saveBlocks: saveSlideBlocksAction,
        saveNotes: saveSlideNotesAction,
        removeSlide: deleteSlideAction,
        moveSlide: moveSlideAction,
        setTheme: setThemeAction,
      }}
    />
  );
}
