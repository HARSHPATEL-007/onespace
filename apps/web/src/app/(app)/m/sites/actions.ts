"use server";

import { SiteService, siteSchema, sitePageSchema } from "@n0va/modules-sites/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new SiteService(workspaceId, userId, role);
};

export async function createSiteAction(formData: FormData) {
  const { name, description } = siteSchema.parse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  return (await svc()).create(name, description);
}

export async function renameSiteAction(formData: FormData) {
  const siteId = String(formData.get("siteId") ?? "");
  const { name, description } = siteSchema.parse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  await (await svc()).rename(siteId, name, description);
}

export async function setPublishedAction(formData: FormData) {
  await (await svc()).setPublished(String(formData.get("siteId") ?? ""), formData.get("published") === "true");
}

export async function removeSiteAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("siteId") ?? ""));
}

export async function addSitePageAction(formData: FormData) {
  await (await svc()).addPage(String(formData.get("siteId") ?? ""));
}

export async function updateSitePageAction(formData: FormData) {
  const siteId = String(formData.get("siteId") ?? "");
  const pageId = String(formData.get("pageId") ?? "");
  const title = String(formData.get("title") ?? "");
  const blocksRaw = String(formData.get("blocks") ?? "");
  const input: { title?: string; blocks?: unknown } = {};
  if (title.trim()) {
    const parsed = sitePageSchema.safeParse({ title, slug: "ignored" });
    if (parsed.success) input.title = parsed.data.title;
  }
  if (blocksRaw) {
    try {
      input.blocks = JSON.parse(blocksRaw);
    } catch {
      // ignore malformed payloads
    }
  }
  await (await svc()).updatePage(siteId, pageId, input);
}

export async function removeSitePageAction(formData: FormData) {
  await (await svc()).removePage(String(formData.get("siteId") ?? ""), String(formData.get("pageId") ?? ""));
}

export async function moveSitePageAction(formData: FormData) {
  await (await svc()).movePage(
    String(formData.get("siteId") ?? ""),
    String(formData.get("pageId") ?? ""),
    formData.get("dir") === "up" ? "up" : "down",
  );
}
