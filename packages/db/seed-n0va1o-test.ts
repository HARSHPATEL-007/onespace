import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seed() {
  const ws = await prisma.workspace.findUnique({ where: { slug: "n0va-demo" } });
  if (!ws) {
    console.log("No demo workspace found");
    process.exit(1);
  }

  // GitHub integration
  let github = await prisma.integration.findFirst({ where: { workspaceId: ws.id, provider: "github" } });
  if (!github) {
    github = await prisma.integration.create({
      data: {
        workspaceId: ws.id,
        provider: "github",
        name: "Demo GitHub",
        category: "development",
        status: "active",
        enabled: true,
        mcpEnabled: true,
        config: { owner: "octocat" },
      },
    });
    console.log("Created github integration:", github.id);
  } else {
    console.log("GitHub integration exists:", github.id);
  }

  // Google Drive integration
  let gdrive = await prisma.integration.findFirst({ where: { workspaceId: ws.id, provider: "google" } });
  if (!gdrive) {
    gdrive = await prisma.integration.create({
      data: {
        workspaceId: ws.id,
        provider: "google",
        name: "Demo Google Drive",
        category: "storage",
        status: "active",
        enabled: true,
        mcpEnabled: true,
        config: {},
      },
    });
    console.log("Created google integration:", gdrive.id);
  } else {
    console.log("Google integration exists:", gdrive.id);
  }

  // Slack integration
  let slack = await prisma.integration.findFirst({ where: { workspaceId: ws.id, provider: "slack" } });
  if (!slack) {
    slack = await prisma.integration.create({
      data: {
        workspaceId: ws.id,
        provider: "slack",
        name: "Demo Slack",
        category: "communication",
        status: "active",
        enabled: true,
        mcpEnabled: true,
        config: { channel: "general" },
      },
    });
    console.log("Created slack integration:", slack.id);
  } else {
    console.log("Slack integration exists:", slack.id);
  }

  await prisma.$disconnect();
  console.log("SEEDED");
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
