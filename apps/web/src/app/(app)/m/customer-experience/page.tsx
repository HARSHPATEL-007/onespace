import { CxService } from "@n0va/modules-customer-experience/server";
import { SupportDesk } from "@n0va/modules-customer-experience/components";
import { requireWorkspace } from "@/lib/context";
import { createTicketAction, setTicketStatusAction, setTicketPriorityAction, replyTicketAction, removeTicketAction } from "./actions";

export default async function CustomerExperiencePage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new CxService(workspaceId, userId, role);
  const tickets = await svc.tickets();

  return (
    <SupportDesk
      tickets={tickets}
      actions={{ create: createTicketAction, setStatus: setTicketStatusAction, setPriority: setTicketPriorityAction, reply: replyTicketAction, remove: removeTicketAction }}
    />
  );
}
