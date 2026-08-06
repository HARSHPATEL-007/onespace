import { notFound } from "next/navigation";
import { LearningService } from "@n0va/modules-booklm/server";
import { LearningSetView } from "@n0va/modules-booklm/components";
import { requireWorkspace } from "@/lib/context";
import { updateLearningSetAction, addLearningItemAction, removeLearningItemAction, moveLearningItemAction } from "../actions";

export default async function LearningSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new LearningService(workspaceId, userId, role);

  let set;
  try {
    set = await svc.get(id);
  } catch {
    notFound();
  }
  if (!set) notFound();

  const [docPicks, videoPicks] = await Promise.all([svc.pickDocs(), svc.pickVideos()]);

  return (
    <LearningSetView
      set={set}
      docPicks={docPicks}
      videoPicks={videoPicks}
      actions={{
        updateMeta: updateLearningSetAction,
        addItem: addLearningItemAction,
        removeItem: removeLearningItemAction,
        moveItem: moveLearningItemAction,
      }}
    />
  );
}
