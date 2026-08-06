import { notFound, redirect } from "next/navigation";
import { SheetsService } from "@n0va/modules-sheets/server";
import { SheetGrid } from "@n0va/modules-sheets/components";
import { requireWorkspace } from "@/lib/context";
import {
  saveCellAction,
  renameWorkbookAction,
  addSheetAction,
  renameSheetAction,
  removeSheetAction,
} from "../actions";

export default async function WorkbookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sheet?: string }>;
}) {
  const { id } = await params;
  const { sheet } = await searchParams;
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new SheetsService(workspaceId, userId, role);

  let wb;
  try {
    wb = await svc.get(id);
  } catch {
    notFound();
  }

  const activeSheet =
    wb.sheets.find((s) => s.id === sheet) ??
    wb.sheets[0] ??
    (await svc.addSheet(wb.id, "Sheet 1"));

  const rows = (activeSheet.rows ?? []) as string[][];

  return (
    <SheetGrid
      workbookId={wb.id}
      workbookName={wb.name}
      sheets={wb.sheets}
      activeSheet={activeSheet}
      rows={rows}
      actions={{
        saveCell: saveCellAction,
        renameWorkbook: renameWorkbookAction,
        addSheet: addSheetAction,
        renameSheet: renameSheetAction,
        removeSheet: removeSheetAction,
      }}
    />
  );
}
