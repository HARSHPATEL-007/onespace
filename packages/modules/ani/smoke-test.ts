import { AniService } from "./src/server";
import { prisma } from "@n0va/db";

async function smoke() {
  console.log("=== N0VA ANI Smoke Test ===\n");

  const workspace = await prisma.workspace.findFirst({ where: { slug: "n0va-demo" } });
  if (!workspace) {
    console.error("ERROR: No demo workspace found. Run: pnpm db:seed");
    process.exit(1);
  }

  const user = await prisma.workspaceMember.findFirst({ where: { workspaceId: workspace.id, role: "OWNER" } });
  if (!user) {
    console.error("ERROR: No owner member found.");
    process.exit(1);
  }

  const svc = new AniService(workspace.id, user.userId, "OWNER");

  process.stdout.write("1. Creating conversation... ");
  const conv = await svc.create("Smoke test conversation");
  console.log(`✓ (${conv.id})`);

  process.stdout.write("2. Sending message (RAG + fallback)... ");
  const result = await svc.send(conv.id, "What is the product strategy?");
  console.log(`✓ (${result.assistantMessage.content.slice(0, 60)}...)`);
  if (result.citations) {
    const citations = JSON.parse(result.citations);
    console.log(`    Found ${citations.length} workspace document(s) via RAG`);
  }

  process.stdout.write("3. Checking memory stats... ");
  await new Promise((r) => setTimeout(r, 200));
  const memStats = await svc.getMemoryStats();
  console.log(`✓ total=${memStats.total} working=${memStats.working} semantic=${memStats.semantic}`);

  process.stdout.write("4. Opening conversation... ");
  const opened = await svc.open(conv.id);
  console.log(`✓ (${opened.messages.length} messages)`);

  process.stdout.write("5. Classifying intent... ");
  const intent = await svc.classify("Schedule a meeting with the team");
  console.log(`✓ (${intent.classification}, risk=${intent.riskLevel})`);

  process.stdout.write("6. Getting consciousness metrics... ");
  const metrics = await svc.getConsciousnessMetrics();
  console.log(`✓ (${metrics ? "available" : "null"})`);

  process.stdout.write("7. Getting system health... ");
  const health = await svc.getSystemHealth();
  console.log(`✓ (${health.status}, ${health.degradedFeatures.length} degraded)`);

  process.stdout.write("8. Processing with engine... ");
  const engineResult = await svc.processWithEngine("Summarize the workspace activity");
  console.log(`✓ (${engineResult.content.slice(0, 50)}...)`);

  console.log("\n=== All smoke tests passed ===");
}

smoke()
  .catch((e) => { console.error("\nFAILED:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
