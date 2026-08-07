"use server";

import { DocsService, docMetaSchema, commentSchema } from "@n0va/modules-docs/server";
import type { RevisionItem } from "@n0va/modules-docs/components";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new DocsService(workspaceId, userId, role);
};

export async function createDocAction() {
  await (await svc()).create();
}

export async function renameDocAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "");
  const { title: parsed } = docMetaSchema.parse({ title });
  await (await svc()).updateTitle(id, parsed);
}

export async function saveDocContentAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const content = String(formData.get("content") ?? "");
  await (await svc()).saveContent(id, content);
}

export async function togglePinAction(formData: FormData) {
  await (await svc()).togglePin(String(formData.get("id") ?? ""));
}

export async function deleteDocAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("id") ?? ""));
}

export async function addCommentAction(formData: FormData) {
  const docId = String(formData.get("docId") ?? "");
  const authorName = String(formData.get("authorName") ?? "");
  const text = String(formData.get("text") ?? "");
  const { text: parsed } = commentSchema.parse({ text });
  await (await svc()).addComment(docId, parsed, authorName);
}

export async function getRevisionsAction(formData: FormData): Promise<RevisionItem[]> {
  const id = String(formData.get("id") ?? "");
  return (await svc()).revisionsWithAuthors(id);
}

export async function restoreRevisionAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const revisionId = String(formData.get("revisionId") ?? "");
  const service = await svc();
  const revision = await service.revisionContent(id, revisionId);
  await service.saveContent(id, revision.content);
}
