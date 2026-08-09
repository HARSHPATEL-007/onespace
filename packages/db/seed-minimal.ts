import bcrypt from "bcryptjs";
import { prisma } from "./src/index";

async function main() {
  const passwordHash = await bcrypt.hash("n0va-demo-pass", 10);

  const owner = await prisma.user.upsert({
    where: { email: "demo@n0va.workspace" },
    update: { passwordHash },
    create: { email: "demo@n0va.workspace", name: "N0VA Founder", passwordHash },
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: "n0va-demo" },
    update: {},
    create: { slug: "n0va-demo", name: "N0VA Demo Workspace", plan: "enterprise" },
  });

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: owner.id } },
    update: { status: "ACTIVE" },
    create: { workspaceId: workspace.id, userId: owner.id, role: "OWNER", status: "ACTIVE" },
  });

  await prisma.workspacePermission.createMany({
    data: [
      { workspaceId: workspace.id, role: "OWNER", module: "mail", action: "READ" },
      { workspaceId: workspace.id, role: "OWNER", module: "mail", action: "CREATE" },
      { workspaceId: workspace.id, role: "OWNER", module: "mail", action: "UPDATE" },
      { workspaceId: workspace.id, role: "OWNER", module: "mail", action: "DELETE" },
    ],
    skipDuplicates: true,
  });

  console.log("Workspace ID: " + workspace.id);
  console.log("User ID: " + owner.id);
  console.log("Email: demo@n0va.workspace");
  console.log("Password: n0va-demo-pass");
  console.log("SEEDED");
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
