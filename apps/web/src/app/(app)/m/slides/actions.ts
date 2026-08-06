"use server";

import { SlidesService, presentationSchema, blocksSchema } from "@n0va/modules-slides/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new SlidesService(workspaceId, userId, role);
};

export async function createPresentationAction(formData: FormData) {
  const { title } = presentationSchema.parse({ title: String(formData.get("title") ?? "") });
  await (await svc()).create(title);
}

export async function renamePresentationAction(formData: FormData) {
  const { title } = presentationSchema.parse({ title: String(formData.get("title") ?? "") });
  await (await svc()).rename(String(formData.get("id") ?? ""), title);
}

export async function setThemeAction(formData: FormData) {
  await (await svc()).setTheme(String(formData.get("id") ?? ""), String(formData.get("theme") ?? "dark"));
}

export async function deletePresentationAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("id") ?? ""));
}

export async function addSlideAction(formData: FormData) {
  await (await svc()).addSlide(String(formData.get("presentationId") ?? ""));
}

export async function saveSlideBlocksAction(formData: FormData) {
  const slideId = String(formData.get("slideId") ?? "");
  const raw = String(formData.get("blocks") ?? "[]");
  const blocks = blocksSchema.parse(JSON.parse(raw));
  await (await svc()).saveBlocks(slideId, blocks);
}

export async function deleteSlideAction(formData: FormData) {
  await (await svc()).removeSlide(String(formData.get("slideId") ?? ""));
}

export async function moveSlideAction(formData: FormData) {
  const direction = String(formData.get("direction") ?? "up");
  await (await svc()).moveSlide(String(formData.get("slideId") ?? ""), direction === "down" ? "down" : "up");
}
