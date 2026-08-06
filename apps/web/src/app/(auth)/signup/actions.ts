"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { signIn } from "@n0va/auth";
import { prisma, logAudit } from "@n0va/db";
import { Role, PermissionAction } from "@prisma/client";

const signupSchema = z.object({
  name: z.string().min(2, "Enter your name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  workspaceName: z.string().min(2, "Enter a workspace name"),
});

export interface SignUpState {
  error?: string;
}

export async function signUpAction(
  _prev: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    workspaceName: formData.get("workspaceName"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { name, email, password, workspaceName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with this email already exists." };

  const passwordHash = await bcrypt.hash(password, 10);
  const slugBase = workspaceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;

  const [user, workspace] = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: { email, name, passwordHash },
    });
    const w = await tx.workspace.create({
      data: { slug, name: workspaceName },
    });
    await tx.workspaceMember.create({
      data: { workspaceId: w.id, userId: u.id, role: Role.OWNER },
    });
    await tx.workspacePermission.createMany({
      data: coreModules.flatMap((module) =>
        allActions.map((action) => ({
          workspaceId: w.id,
          role: Role.OWNER,
          module,
          action,
        })),
      ),
    });
    return [u, w] as const;
  });

  await logAudit({
    workspaceId: workspace.id,
    actorId: user.id,
    module: "core",
    action: "workspace.created",
    metadata: { via: "signup" },
  });

  const result = await signIn("credentials", {
    email,
    password,
    redirect: false,
  });
  if (result?.error) {
    return { error: "Account created, but automatic sign-in failed. Please sign in." };
  }

  redirect("/launcher");
}

const coreModules = ["mail", "cloud-storage", "docs", "sheets", "chat", "calendar", "tasks", "keep", "forms", "contacts"];

const allActions = [
  PermissionAction.READ,
  PermissionAction.CREATE,
  PermissionAction.UPDATE,
  PermissionAction.DELETE,
  PermissionAction.ADMIN,
];