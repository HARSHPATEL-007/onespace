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

  await seedMailDemo(workspace.id);

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

async function seedMailDemo(workspaceId: string) {
  const product = await prisma.mailLabel.upsert({
    where: { id: `label-${workspaceId}-product` },
    update: {},
    create: { id: `label-${workspaceId}-product`, workspaceId, name: "Product", color: "#0ea5e9" },
  });

  const existing = await prisma.mailMessage.count({ where: { workspaceId } });
  if (existing > 0) return;

  const threadA = crypto.randomUUID();
  const threadB = crypto.randomUUID();
  const threadC = crypto.randomUUID();

  await prisma.mailMessage.createMany({
    data: [
      {
        workspaceId,
        threadId: threadA,
        direction: "IN",
        folder: "INBOX",
        fromName: "Ava Chen",
        fromEmail: "ava@n0va.workspace",
        toEmails: ["demo@n0va.workspace"],
        subject: "Welcome to N0VA Workspace",
        body: "Hi there,\n\nWelcome to your brand new workspace. Everything you see here is built from the same design system with full tenant isolation.\n\nTry opening Docs and writing something — it autosaves every few seconds with version history.\n\nCheers,\nAva",
        isRead: false,
        isStarred: true,
      },
      {
        workspaceId,
        threadId: threadA,
        direction: "OUT",
        folder: "SENT",
        fromName: "N0VA Workspace",
        fromEmail: "outbox@n0va.workspace",
        toEmails: ["ava@n0va.workspace"],
        subject: "Re: Welcome to N0VA Workspace",
        body: "Thanks Ava! The docs editor is slick.",
        isRead: true,
        sentAt: new Date(Date.now() - 3600_000),
      },
      {
        workspaceId,
        threadId: threadB,
        direction: "IN",
        folder: "INBOX",
        fromName: "Marcus Lee",
        fromEmail: "marcus@n0va.workspace",
        toEmails: ["demo@n0va.workspace"],
        subject: "Q3 OKRs draft is ready",
        body: "Morning,\n\nThe Q3 draft is ready for review. Key themes: ship the sheets module end-to-end, dogfood chat for team comms, and improve the onboarding flow.\n\nCan you take a look before Thursday?\n\n— Marcus",
        isRead: false,
      },
      {
        workspaceId,
        threadId: threadB,
        direction: "IN",
        folder: "INBOX",
        fromName: "Marcus Lee",
        fromEmail: "marcus@n0va.workspace",
        toEmails: ["demo@n0va.workspace"],
        subject: "Re: Q3 review draft is ready",
        body: "Also — I pushed a few formulas into the budget sheet. =SUM(fixed_costs) works. Play with it!",
        isRead: true,
        sentAt: new Date(Date.now() - 1_800_000),
      },
      {
        workspaceId,
        threadId: threadC,
        direction: "IN",
        folder: "INBOX",
        fromName: "N0VA Support",
        fromEmail: "support@n0va.workspace",
        toEmails: ["demo@n0va.workspace"],
        subject: "Your storage is at 60% capacity",
        body: "Heads up — your connected cloud storage is 60% full. Empty the trash to reclaim space, or upgrade the plan for more room.",
        isRead: true,
        sentAt: new Date(Date.now() - 8640_000),
      },
    ],
  });

  const [welcome] = await prisma.mailMessage.findMany({
    where: { workspaceId, subject: "Welcome to N0VA Workspace" },
    take: 1,
  });
  const [q3] = await prisma.mailMessage.findMany({
    where: { workspaceId, subject: "Q3 review draft is ready" },
    take: 1,
  });
  if (welcome && product) {
    await prisma.mailLabelMap.create({ data: { messageId: welcome.id, labelId: product.id, workspaceId } });
  }
  if (q3 && product) {
    await prisma.mailLabelMap.create({ data: { messageId: q3.id, labelId: product.id, workspaceId } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());