import { DocsService } from "@n0va/modules-docs/server";
import { DocsList } from "@n0va/modules-docs/components";
import { requireWorkspace } from "@/lib/context";
import {
  createDocAction,
  renameDocAction,
  togglePinAction,
  deleteDocAction,
  saveDocContentAction,
  addCommentAction,
} from "./actions";

export default async function DocsPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new DocsService(workspaceId, userId, role);
  const docs = await svc.list();

  return (
    <DocsList
      docs={docs}
      actions={{
        create: createDocAction,
        rename: renameDocAction,
        togglePin: togglePinAction,
        remove: deleteDocAction,
        save: saveDocContentAction,
        comment: addCommentAction,
      }}
    />
  );
}
