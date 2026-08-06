import { FinanceService } from "@n0va/modules-finance/server";
import { InvoiceLedger } from "@n0va/modules-finance/components";
import { requireWorkspace } from "@/lib/context";
import { createInvoiceAction, markSentAction, markPaidAction, removeInvoiceAction } from "./actions";

export default async function FinancePage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new FinanceService(workspaceId, userId, role);
  const invoices = await svc.list();

  return (
    <InvoiceLedger
      invoices={invoices}
      actions={{ create: createInvoiceAction, markSent: markSentAction, markPaid: markPaidAction, remove: removeInvoiceAction }}
    />
  );
}
