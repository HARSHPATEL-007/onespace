const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  for (const t of ["ThreadMetadata", "ThreadDecision", "ThreadActionItem"]) {
    const rows = await p.$queryRawUnsafe("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position", t);
    console.log(`== ${t} ==`);
    console.log(rows.map((r) => `${r.column_name}:${r.data_type}:${r.is_nullable}`).join(" | "));
  }
})().finally(() => p.$disconnect());