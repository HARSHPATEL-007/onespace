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
  await seedSheetsDemo(workspace.id);
  await seedPhase2Demo(workspace.id, owner.id, admin.id);
  await seedPhase3Demo(workspace.id, owner.id, admin.id);

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

async function seedSheetsDemo(workspaceId: string) {
  const existing = await prisma.sheetWorkbook.count({ where: { workspaceId } });
  if (existing > 0) return;

  const rows: string[][] = [
    ["Item", "Q1", "Q2", "Q3", "Q4", "Total"],
    ["Product revenue", "12000", "14500", "16800", "19000", "=SUM(B2:E2)"],
    ["Services", "5400", "6200", "6800", "7300", "=SUM(B3:E3)"],
    ["Licensing", "3100", "3500", "4000", "4600", "=SUM(B4:E4)"],
    ["", "", "", "", "", ""],
    ["Total revenue", "=SUM(B2:B4)", "=SUM(C2:C4)", "=SUM(D2:D4)", "=SUM(E2:E4)", "=SUM(B6:F6)"],
    ["Costs", "-4100", "-4400", "-4800", "-5200", "=SUM(B7:E7)"],
    ["", "", "", "", "", ""],
    ["Net margin", "=B6-B7", "=C6-C7", "=D6-D7", "=E6-E7", "=F6-F7"],
    ["Margin %", "=F6/F9*100", "", "", "", ""],
    ["", "", "", "", "", ""],
    ["Average Q revenue", "=AVERAGE(B6:E6)", "", "", "", ""],
    ["Best quarter", "=MAX(B6:E6)", "", "", "", ""],
    ["Worst quarter", "=MIN(B6:E6)", "", "", "", ""],
  ];
  const wide = rows.map((r) => {
    const out = Array.from({ length: 26 }, () => "");
    r.forEach((v, i) => (out[i] = v));
    return out;
  });

  await prisma.sheetWorkbook.create({
    data: {
      workspaceId,
      name: "Q3 Budget",
      sheets: {
        create: { workspaceId, name: "Revenue", rows: wide },
      },
    },
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

async function seedPhase2Demo(workspaceId: string, ownerId: string, adminId: string) {
  // SLIDES — demo deck
  const deckCount = await prisma.presentation.count({ where: { workspaceId } });
  if (deckCount === 0) {
    await prisma.presentation.create({
      data: {
        workspaceId,
        createdById: ownerId,
        title: "N0VA Workspace — Product Overview",
        theme: "minimal",
        slides: {
          create: [
            {
              workspaceId,
              sortOrder: 0,
              blocks: [
                { type: "title", content: "N0VA Workspace" },
                { type: "subtitle", content: "One Enterprise System, built as a modular suite" },
              ],
            },
            {
              workspaceId,
              sortOrder: 1,
              blocks: [
                { type: "title", content: "The modular core" },
                { type: "bullets", content: "10 core modules live\nShared design system\nFull tenant isolation\nType-safe actions end to end" },
              ],
            },
            {
              workspaceId,
              sortOrder: 2,
              blocks: [
                { type: "title", content: "Phase 2 arriving" },
                { type: "bullets", content: "Cloud Search\nGroups\nSlides\nDrawings\nPics\nVideos\nMeet\nSites\nBookLM\nVoice" },
              ],
            },
          ],
        },
      },
    });
  }

  // DRAWINGS — demo canvas
  const drawingCount = await prisma.drawing.count({ where: { workspaceId } });
  if (drawingCount === 0) {
    await prisma.drawing.create({
      data: {
        workspaceId,
        createdById: ownerId,
        name: "Architecture sketch",
        canvas: [
          { id: "s1", type: "rect", x: 40, y: 40, w: 180, h: 90, fill: "#7c5cfc", stroke: "#7c5cfc" },
          { id: "s2", type: "rect", x: 300, y: 40, w: 180, h: 90, fill: "#0ea5e9", stroke: "#0ea5e9" },
          { id: "s3", type: "line", x1: 220, y1: 85, x2: 300, y2: 85, stroke: "#1a1c23" },
          { id: "s4", type: "ellipse", cx: 400, cy: 260, rx: 120, ry: 70, fill: "#f59e0b", stroke: "#f59e0b" },
          { id: "s5", type: "text", x: 70, y: 78, text: "Web", size: 20, fill: "#ffffff" },
          { id: "s6", type: "text", x: 340, y: 78, text: "API", size: 20, fill: "#ffffff" },
          { id: "s7", type: "text", x: 352, y: 262, text: "Postgres", size: 18, fill: "#ffffff" },
        ],
      },
    });
  }

  // VIDEOS — demo library entry
  const videoCount = await prisma.video.count({ where: { workspaceId } });
  if (videoCount === 0) {
    await prisma.video.create({
      data: {
        workspaceId,
        createdById: ownerId,
        title: "Welcome to N0VA Workspace (demo)",
        description: "A quick tour of the modular suite.",
        url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
        provider: "youtube",
        durationSec: 19,
      },
    });
  }

  // SITES — demo site with two pages
  const siteCount = await prisma.site.count({ where: { workspaceId } });
  if (siteCount === 0) {
    const homeBlocks = [
      { id: "b1", type: "heading", content: "Welcome to N0VA Workspace", bullets: [] },
      { id: "b2", type: "text", content: "This site was generated by N0VA SITES. Every page is built from DOCS-style blocks and publishes with one click.", bullets: [] },
      { id: "b3", type: "quote", content: "One enterprise system — built solo, as a modular suite.", bullets: [] },
      { id: "b4", type: "bullets", content: "", bullets: ["16 modules live", "Docs, Sheets, Chat, Mail and more", "Simulated meetings and calls"] },
    ];
    const aboutBlocks = [
      { id: "b1", type: "heading", content: "About this demo", bullets: [] },
      { id: "b2", type: "text", content: "Everything here runs on a shared design system with tenant-scoped data. Try editing this page and hitting preview.", bullets: [] },
    ];
    await prisma.site.create({
      data: {
        workspaceId,
        createdById: ownerId,
        name: "N0VA Demo Site",
        description: "A sample published site",
        published: true,
        pages: {
          create: [
            { workspaceId, title: "Home", slug: "home", sortOrder: 0, blocks: homeBlocks },
            { workspaceId, title: "About", slug: "about", sortOrder: 1, blocks: aboutBlocks },
          ],
        },
      },
    });
  }

  // GROUPS — demo team space
  const groupCount = await prisma.group.count({ where: { workspaceId } });
  if (groupCount === 0) {
    const group = await prisma.group.create({
      data: { workspaceId, createdById: ownerId, name: "Core Team", description: "Everyone working on the workspace core." },
    });
    await prisma.groupMember.createMany({
      data: [
        { groupId: group.id, userId: ownerId, workspaceId },
        { groupId: group.id, userId: adminId, workspaceId },
      ],
      skipDuplicates: true,
    });
  }

  // MEET — one live demo room
  const roomCount = await prisma.meetRoom.count({ where: { workspaceId } });
  if (roomCount === 0) {
    const room = await prisma.meetRoom.create({
      data: { workspaceId, createdById: ownerId, name: "Team standup (demo)" },
    });
    await prisma.meetParticipant.upsert({
      where: { roomId_userId: { roomId: room.id, userId: ownerId } },
      update: {},
      create: { roomId: room.id, userId: ownerId, workspaceId, name: "N0VA Founder" },
    });
    await prisma.meetMessage.create({
      data: { roomId: room.id, workspaceId, authorName: "N0VA Founder", body: "Morning everyone — welcome to the demo room." },
    });
  }

  // BOOKLM — demo learning set that links a doc + the demo video
  const setCount = await prisma.learningSet.count({ where: { workspaceId } });
  if (setCount === 0) {
    const doc = await prisma.doc.findFirst({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
    const video = await prisma.video.findFirst({ where: { workspaceId } });
    await prisma.learningSet.create({
      data: {
        workspaceId,
        createdById: ownerId,
        title: "Getting started",
        description: "Sources for the first-week onboarding.",
        items: {
          create: [
            ...(doc ? [{ workspaceId, kind: "DOC" as const, title: doc.title, refId: doc.id, sortOrder: 0 }] : []),
            ...(video ? [{ workspaceId, kind: "VIDEO" as const, title: video.title, refId: video.id, notes: "Watch the tour before your first meeting.", sortOrder: 1 }] : []),
            { workspaceId, kind: "NOTE" as const, title: "Key phrases", notes: "Modular suite · tenant isolation · autosave everywhere", sortOrder: 2 },
          ],
        },
      },
    });
  }

  // VOICE — demo call history
  const callCount = await prisma.callLog.count({ where: { workspaceId } });
  if (callCount === 0) {
    await prisma.callLog.createMany({
      data: [
        { workspaceId, direction: "OUT", number: "+1 555 010 0110", contactName: "Ava Chen", durationSec: 84, status: "completed", startedAt: new Date(Date.now() - 3600_000 * 5) },
        { workspaceId, direction: "IN", number: "+1 555 010 0119", contactName: "Marcus Lee", durationSec: 152, status: "completed", startedAt: new Date(Date.now() - 3600_000 * 26) },
        { workspaceId, direction: "IN", number: "+1 555 010 0199", contactName: "Unknown", durationSec: 0, status: "missed", startedAt: new Date(Date.now() - 3600_000 * 49) },
      ],
    });
  }
}

async function seedPhase3Demo(workspaceId: string, ownerId: string, adminId: string) {
  // VAULT — encrypted secret store
  const vaultCount = await prisma.vaultEntry.count({ where: { workspaceId } });
  if (vaultCount === 0) {
    const crypto = await import("node:crypto");
    const key = crypto.createHash("sha256").update("n0va-dev-vault-key-change-me").digest();
    const makeEntry = (value: string, hint: string) => {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
    };
    await prisma.vaultEntry.createMany({
      data: [
        { workspaceId, createdById: ownerId, name: "Staging API token", encryptedValue: makeEntry("sk-staging-7f3a9c", "Rotate monthly"), hint: "Used by the sync worker" },
        { workspaceId, createdById: ownerId, name: "AWS access key", encryptedValue: makeEntry("AKIA2Z5N7Q8W1D4F6H", "Key for S3 backups"), hint: "IAM user: n0va-backup" },
        { workspaceId, createdById: adminId, name: "Demo billing webhook", encryptedValue: makeEntry("whsec_n0va_demo_9d31", "Stripe test mode"), hint: "Endpoint /api/billing/hooks" },
      ],
    });
  }

  // WORKSPACE STUDIO — automations
  const automationCount = await prisma.automation.count({ where: { workspaceId } });
  if (automationCount === 0) {
    await prisma.automation.createMany({
      data: [
        { workspaceId, createdById: adminId, name: "Weekly digest", trigger: "SCHEDULE", action: "LOG", config: { cron: "0 9 * * 1" }, enabled: true, lastRunAt: new Date(Date.now() - 3600_000 * 72) },
        { workspaceId, createdById: ownerId, name: "Q3 report draft", trigger: "MANUAL", action: "CREATE_DOC", config: { title: "Q3 weekly report" }, enabled: true, lastRunAt: new Date(Date.now() - 3600_000 * 5) },
        { workspaceId, createdById: adminId, name: "New member welcome", trigger: "EVENT", action: "NOTIFY", config: { channel: "chat" }, enabled: false },
      ],
    });
  }

  // N0VA1O — integrations
  const integrationCount = await prisma.integration.count({ where: { workspaceId } });
  if (integrationCount === 0) {
    const slack = await prisma.integration.create({
      data: { workspaceId, createdById: adminId, provider: "slack", name: "Design channel", status: "connected", config: { token: "xoxb-demo" }, enabled: true, lastSyncAt: new Date(Date.now() - 3600_000 * 2) },
    });
    await prisma.integration.create({
      data: { workspaceId, createdById: ownerId, provider: "gdrive", name: "Marketing assets", status: "connected", config: {}, enabled: true, lastSyncAt: new Date(Date.now() - 3600_000 * 20) },
    });
    await prisma.integrationLog.createMany({
      data: [
        { workspaceId, integrationId: slack.id, level: "info", message: "Synced slack — 12 items pulled", createdAt: new Date(Date.now() - 3600_000 * 2) },
        { workspaceId, integrationId: slack.id, level: "info", message: "Connected slack", createdAt: new Date(Date.now() - 3600_000 * 3) },
      ],
    });
  }

  // ANI — assistant conversations
  const aniCount = await prisma.aniConversation.count({ where: { workspaceId } });
  if (aniCount === 0) {
    const convo = await prisma.aniConversation.create({
      data: { workspaceId, createdById: ownerId, title: "Q3 planning" },
    });
    await prisma.aniMessage.createMany({
      data: [
        { conversationId: convo.id, workspaceId, role: "user", content: "Can you draft an agenda for our Q3 planning offsite?" },
        { conversationId: convo.id, workspaceId, role: "assistant", content: "Sure — I'd suggest: (1) OKR review, (2) module demos, (3) dogfooding retro, (4) roadmap next-quarter. Want me to turn this into a doc?", createdAt: new Date(Date.now() - 3600_000 * 6) },
      ],
    });
  }

  // APPSCRIPT — scripts
  const scriptCount = await prisma.script.count({ where: { workspaceId } });
  if (scriptCount === 0) {
    const script = await prisma.script.create({
      data: {
        workspaceId,
        createdById: adminId,
        name: "Usage stats",
        language: "js",
        code: "const totals = [12, 45, 23, 67];\nconsole.log(\"Docs opened this week:\", totals.reduce((a, b) => a + b, 0));\nconsole.log(\"Average per day:\", (totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1));",
        lastRunAt: new Date(Date.now() - 3600_000 * 24),
      },
    });
    await prisma.scriptRun.create({
      data: { scriptId: script.id, workspaceId, status: "success", output: "Docs opened this week: 147\nAverage per day: 36.8", durationMs: 42, startedAt: new Date(Date.now() - 3600_000 * 24) },
    });
  }

  // ENDPOINT MANAGEMENT — devices
  const deviceCount = await prisma.endpointDevice.count({ where: { workspaceId } });
  if (deviceCount === 0) {
    await prisma.endpointDevice.createMany({
      data: [
        { workspaceId, ownerId, name: "Founder laptop", type: "LAPTOP", os: "macOS 15", status: "ACTIVE", compliant: true, lastSeenAt: new Date(Date.now() - 3600_000 * 1), enrolledAt: new Date(Date.now() - 86400_000 * 90) },
        { workspaceId, ownerId: adminId, name: "Admin workstation", type: "LAPTOP", os: "Windows 11 Pro", status: "ACTIVE", compliant: true, lastSeenAt: new Date(Date.now() - 3600_000 * 6), enrolledAt: new Date(Date.now() - 86400_000 * 80) },
        { workspaceId, ownerId, name: "Old test phone", type: "MOBILE", os: "Android 15", status: "REVOKED", compliant: false, lastSeenAt: new Date(Date.now() - 86400_000 * 12), enrolledAt: new Date(Date.now() - 86400_000 * 60) },
      ],
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());