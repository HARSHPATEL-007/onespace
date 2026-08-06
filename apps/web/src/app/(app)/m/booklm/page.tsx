import { LearningService } from "@n0va/modules-booklm/server";
import { LearningSets } from "@n0va/modules-booklm/components";
import { requireWorkspace } from "@/lib/context";
import { createLearningSetAction, updateLearningSetAction, removeLearningSetAction, addLearningItemAction, removeLearningItemAction, moveLearningItemAction } from "./actions";

export default async function BooklmPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new LearningService(workspaceId, userId, role);
  const sets = await svc.list();

  return (
    <LearningSets
      sets={sets}
      actions={{
        create: createLearningSetAction,
        updateMeta: updateLearningSetAction,
        remove: removeLearningSetAction,
        addItem: addLearningItemAction,
        removeItem: removeLearningItemAction,
        moveItem: moveLearningItemAction,
      }}
    />
  );
}
