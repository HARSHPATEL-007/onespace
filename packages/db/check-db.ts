import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function check() {
  const ws = await prisma.workspace.findUnique({ where: { slug: "n0va-demo" } });
  const user = await prisma.user.findUnique({ where: { email: "demo@n0va.workspace" } });
  const member = await prisma.workspaceMember.findFirst({ where: { workspaceId: ws?.id } });
  const perms = await prisma.workspacePermission.count({ where: { workspaceId: ws?.id } });
  const mailMsgs = await prisma.mailMessage.count();
  console.log("Workspace:", ws?.slug, ws?.id);
  console.log("User:", user?.email, user?.id);
  console.log("Member:", member?.role, member?.status);
  console.log("Permissions:", perms);
  console.log("Mail messages:", mailMsgs);
  await prisma.$disconnect();
}
check().catch((e) => { console.error(e.message); process.exit(1); });
