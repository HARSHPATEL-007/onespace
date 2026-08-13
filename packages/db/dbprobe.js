const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const ws = await p.workspace.findMany({ select: { id: true, name: true } });
  const rooms = await p.chatChannel.findMany({ select: { id: true, name: true }, take: 12 });
  const msgs = await p.chatMessage.count();
  const members = await p.workspaceMember.findMany({ select: { userId: true, role: true, workspaceId: true }, take: 6 });
  const sent = await p.sentimentRecord.count();
  const tox = await p.toxicityFlag.count();
  const health = await p.healthSnapshot.count();
  console.log(JSON.stringify({ ws, roomCount: rooms.length, rooms, msgs, members, sent, tox, health }, null, 1));
})().finally(() => p.$disconnect());