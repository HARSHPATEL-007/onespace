"use server";

import { SheetsService, workbookSchema, sheetNameSchema, cellSchema, cellMetaSchema } from "@n0va/modules-sheets/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new SheetsService(workspaceId, userId, role);
};

export async function createWorkbookAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "");
  const { name: parsed } = workbookSchema.parse({ name });
  await (await svc()).create(parsed);
}

export async function renameWorkbookAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "");
  const { name: parsed } = workbookSchema.parse({ name });
  await (await svc()).rename(id, parsed);
}

export async function deleteWorkbookAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("id") ?? ""));
}

export async function addSheetAction(formData: FormData) {
  const workbookId = String(formData.get("workbookId") ?? "");
  const name = String(formData.get("name") ?? "");
  const { name: parsed } = sheetNameSchema.parse({ name });
  await (await svc()).addSheet(workbookId, parsed);
}

export async function renameSheetAction(formData: FormData) {
  await (await svc()).renameSheet(String(formData.get("sheetId") ?? ""), String(formData.get("name") ?? ""));
}

export async function removeSheetAction(formData: FormData) {
  await (await svc()).removeSheet(String(formData.get("sheetId") ?? ""));
}

export async function saveCellAction(formData: FormData) {
  const sheetId = String(formData.get("sheetId") ?? "");
  const col = Number(formData.get("col") ?? "-1");
  const row = Number(formData.get("row") ?? "-1");
  const value = String(formData.get("value") ?? "");
  const { col: c, row: r, value: v } = cellSchema.parse({ col, row, value });
  await (await svc()).saveCell(sheetId, c, r, v);
}

export async function saveCellMetaAction(formData: FormData) {
  const sheetId = String(formData.get("sheetId") ?? "");
  const meta = cellMetaSchema.parse(JSON.parse(String(formData.get("meta") ?? "{}")));
  await (await svc()).saveCellMeta(sheetId, meta);
}
