import { LegalService } from "@n0va/modules-legal/server";
import { LegalDocs } from "@n0va/modules-legal/components";
import { requireWorkspace } from "@/lib/context";
import { createLegalDocAction, advanceLegalStatusAction, removeLegalDocAction } from "./actions";

export default async function LegalPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new LegalService(workspaceId, userId, role);
  const documents = await svc.list();

  return (
    <LegalDocs
      documents={documents}
      actions={{ create: createLegalDocAction, advanceStatus: advanceLegalStatusAction, remove: removeLegalDocAction }}
    />
  );
}
