import bcrypt from "bcryptjs";
import { Role, PermissionAction } from "@prisma/client";
import { prisma, logAudit } from "../src/index";

// Demo-only credentials. Change in production.
const DEMO_PASSWORD = "n0va-demo-pass";

async function main() {
  console.log("Seeding N0VA Workspace demo…");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const owner = await seedUser("demo@n0va.workspace", "N0VA Founder", passwordHash);
  const admin = await seedUser("admin@n0va.workspace", "N0VA Admin", passwordHash);

  const workspace = await prisma.workspace.upsert({
    where: { slug: "n0va-demo" },
    update: {},
    create: { slug: "n0va-demo", name: "N0VA Demo Workspace", plan: "enterprise" },
  });

  await seedMember(workspace.id, owner.id, Role.OWNER);
  await seedMember(workspace.id, admin.id, Role.ADMIN);

  const coreModules = [
    "mail",
    "cloud-storage",
    "docs",
    "sheets",
    "chat",
    "calendar",
    "tasks",
    "keep",
    "forms",
    "contacts",
  ];
  const allActions = [
    PermissionAction.READ,
    PermissionAction.CREATE,
    PermissionAction.UPDATE,
    PermissionAction.DELETE,
  ];

  for (const module of coreModules) {
    for (const role of [Role.OWNER, Role.ADMIN]) {
      await prisma.workspacePermission.createMany({
        data: allActions.map((action) => ({ workspaceId: workspace.id, role, module, action })),
        skipDuplicates: true,
      });
    }
    await prisma.workspacePermission.createMany({
      data: [{ workspaceId: workspace.id, role: Role.MEMBER, module, action: PermissionAction.READ }],
      skipDuplicates: true,
    });
  }

  await logAudit({
    workspaceId: workspace.id,
    actorId: owner.id,
    module: "core",
    action: "seed",
    metadata: { note: "demo workspace seeded" },
  });

  console.log("✓ Demo workspace seeded");
  console.log("  Sign in: demo@n0va.workspace / " + DEMO_PASSWORD);
  console.log("       or: admin@n0va.workspace / " + DEMO_PASSWORD);
}

async function seedUser(email: string, name: string, passwordHash: string) {
  return prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, name, passwordHash },
  });
}

async function seedMember(workspaceId: string, userId: string, role: Role) {
  return prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId, userId } },
    update: { role, status: "ACTIVE" },
    create: { workspaceId, userId, role, status: "ACTIVE" },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());