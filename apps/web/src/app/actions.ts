"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@n0va/auth";
import { WORKSPACE_COOKIE } from "@n0va/core";

export async function setActiveWorkspace(formData: FormData) {
  const workspaceId = formData.get("workspaceId");
  if (typeof workspaceId === "string") {
    const cookieStore = await cookies();
    cookieStore.set(WORKSPACE_COOKIE, workspaceId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/signin" });
}