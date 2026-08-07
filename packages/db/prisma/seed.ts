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
  await seedPhase4Demo(workspace.id, owner.id, admin.id);
  await seedPhase6Demo(workspace.id, owner.id);

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

  const wiredConnectors: Array<{ provider: string; name: string; category: string; secret: string | null; path: string | null; mcp: boolean; wh: boolean; rlpm: number; retry: number; allow: string[]; config: Record<string, unknown>; owner: boolean }> = [
    { provider: "slack", name: "Design channel", category: "communication", secret: "demo-secret-9f3c1a77b2", path: "abcd1234ef56", mcp: true, wh: true, rlpm: 120, retry: 3, allow: [], config: { token: "xoxb-demo", authType: "oauth2" }, owner: false },
    { provider: "gdrive", name: "Marketing assets", category: "documents", secret: "hook-secret-a1b2c3", path: "8d41e2f00517", mcp: false, wh: true, rlpm: 60, retry: 2, allow: [], config: { authType: "oauth2" }, owner: true },
    { provider: "github", name: "Core repo", category: "devops", secret: null, path: null, mcp: true, wh: false, rlpm: 240, retry: 3, allow: ["list_repos", "list_issues"], config: { authType: "oauth2" }, owner: true },
  ];
  for (const c of wiredConnectors) {
    const existing = await prisma.integration.findFirst({ where: { workspaceId, provider: c.provider } });
    const data = {
      name: c.name,
      category: c.category,
      status: "connected",
      config: c.config,
      mcpEnabled: c.mcp,
      webhookEnabled: c.wh,
      webhookSecret: c.secret,
      webhookPath: c.path,
      rateLimitPerMin: c.rlpm,
      retryMax: c.retry,
      timeoutMs: 15000,
      allowlistTools: c.allow,
      blocklistTools: [],
    };
    if (existing) {
      await prisma.integration.update({ where: { id: existing.id }, data });
    } else {
      await prisma.integration.create({
        data: {
          workspaceId, createdById: c.owner ? ownerId : adminId, provider: c.provider, enabled: true,
          lastSyncAt: new Date(Date.now() - 3600_000 * (c.provider === "github" ? 48 : 4)),
          ...data,
        },
      });
     }
   }

   const slack = await prisma.integration.findFirst({ where: { workspaceId, provider: "slack" } });
  if (slack && (await prisma.integrationLog.count({ where: { integrationId: slack.id } })) === 0) {
    await prisma.integrationLog.createMany({
      data: [
        { workspaceId, integrationId: slack.id, level: "info", direction: "outbound", statusCode: 200, durationMs: 84, idempotencyKey: "k-a1", method: "GET", path: "/sync", meta: { tool: "sync", actorLabel: "owner", provider: "slack" }, message: "Slack: sync completed — 12 items processed via gateway", createdAt: new Date(Date.now() - 3600_000 * 2) },
        { workspaceId, integrationId: slack.id, level: "info", direction: "system", message: "Connected Slack (Communication)", createdAt: new Date(Date.now() - 3600_000 * 3) },
        { workspaceId, integrationId: slack.id, level: "info", direction: "inbound", statusCode: 200, idempotencyKey: "wh_001", method: "POST", meta: { payloadSummary: { keys: ["event", "channel", "user"], sizeBytes: 128 }, actorLabel: "webhook" }, message: "Webhook event received (3 fields, 128 bytes)", createdAt: new Date(Date.now() - 3600_000 * 5) },
      ],
    });
  }

  // N0VA1O retention default + MCP key (idempotent — only set once)
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (ws && !ws.mcpKey) {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { mcpKey: "n0va1o_demo_7f3a9c81b2e4d6f5a0c1", integrationRetentionDays: 90 },
    });
  }

  // N0VA1O — one pending governance access request
  const pendingRequests = await prisma.integrationAccessRequest.count({ where: { workspaceId, status: "PENDING" } });
  if (pendingRequests === 0) {
    const mcpSlack = await prisma.integration.findFirst({ where: { workspaceId, provider: "slack", mcpEnabled: true } });
    if (mcpSlack) {
      await prisma.integrationAccessRequest.create({
        data: {
          workspaceId, integrationId: mcpSlack.id, requesterLabel: "mcp-agent (Claude Code)",
          tool: "create_channel", reason: "Creating a new #announcements channel for the Q3 launch.",
          status: "PENDING",
        },
      });
    }
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

async function seedPhase4Demo(workspaceId: string, ownerId: string, adminId: string) {
  // FINANCE — invoices
  const invoiceCount = await prisma.invoice.count({ where: { workspaceId } });
  if (invoiceCount === 0) {
    await prisma.invoice.createMany({
      data: [
        { workspaceId, createdById: ownerId, number: "INV-0001", customer: "Acme Corp", amountCents: 24_000_00, status: "PAID", dueDate: new Date(Date.now() - 30 * 86_400_000), paidAt: new Date(Date.now() - 25 * 86_400_000) },
        { workspaceId, createdById: ownerId, number: "INV-0002", customer: "Globex Inc", amountCents: 8_500_00, status: "SENT", dueDate: new Date(Date.now() + 7 * 86_400_000) },
        { workspaceId, createdById: adminId, number: "INV-0003", customer: "Initech", amountCents: 3_200_00, status: "OVERDUE", dueDate: new Date(Date.now() - 5 * 86_400_000) },
        { workspaceId, createdById: adminId, number: "INV-0004", customer: "Stark Industries", amountCents: 15_000_00, status: "DRAFT" },
      ],
    });
  }

  // HR — employees and leave
  const employeeCount = await prisma.employee.count({ where: { workspaceId } });
  if (employeeCount === 0) {
    const ava = await prisma.employee.create({ data: { workspaceId, name: "Ava Chen", email: "ava@n0va.workspace", department: "Design", title: "Head of Design", joinedAt: new Date(Date.now() - 400 * 86_400_000) } });
    const marcus = await prisma.employee.create({ data: { workspaceId, name: "Marcus Lee", email: "marcus@n0va.workspace", department: "Engineering", title: "Staff Engineer", joinedAt: new Date(Date.now() - 320 * 86_400_000) } });
    await prisma.employee.create({ data: { workspaceId, name: "Priya Sharma", email: "priya@n0va.workspace", department: "Sales", title: "Account Executive", joinedAt: new Date(Date.now() - 90 * 86_400_000) } });
    await prisma.employee.create({ data: { workspaceId, name: "Tom Okafor", email: "tom@n0va.workspace", department: "Support", title: "CX Lead", status: "INVITED", joinedAt: new Date(Date.now() - 14 * 86_400_000) } });
    await prisma.leaveRequest.createMany({
      data: [
        { workspaceId, employeeId: ava.id, kind: "VACATION", status: "APPROVED", startDate: new Date(Date.now() + 10 * 86_400_000), endDate: new Date(Date.now() + 14 * 86_400_000) },
        { workspaceId, employeeId: marcus.id, kind: "SICK", status: "PENDING", startDate: new Date(Date.now() + 3 * 86_400_000), endDate: new Date(Date.now() + 4 * 86_400_000) },
      ],
    });
  }

  // LEGAL — contracts and policies
  const legalCount = await prisma.legalDocument.count({ where: { workspaceId } });
  if (legalCount === 0) {
    await prisma.legalDocument.createMany({
      data: [
        { workspaceId, createdById: ownerId, title: "Master Services Agreement", kind: "CONTRACT", status: "ACTIVE", content: "1. Services. Provider will deliver the N0VA modules in the order agreed.\n2. Term. 12 months from the effective date.\n3. Fees. Invoiced monthly per the pricing schedule.\n4. Confidentiality. Both parties hold all non-public information in confidence.", effectiveDate: new Date(Date.now() - 200 * 86_400_000), reviewDate: new Date(Date.now() + 165 * 86_400_000) },
        { workspaceId, createdById: adminId, title: "Acceptable Use Policy", kind: "POLICY", status: "IN_REVIEW", content: "Users may not upload illegal content, attempt unauthorized access to other tenants, or resell access to the platform without written consent." },
        { workspaceId, createdById: adminId, title: "SOC 2 readiness checklist", kind: "COMPLIANCE", status: "DRAFT", content: "- Access control review\n- Encryption at rest audit\n- Backup restore test\n- Vendor risk assessment" },
      ],
    });
  }

  // OPERATIONS & TEAMS — runbooks and incidents
  const runbookCount = await prisma.opsRunbook.count({ where: { workspaceId } });
  if (runbookCount === 0) {
    await prisma.opsRunbook.createMany({
      data: [
        { workspaceId, createdById: adminId, title: "Database failover", description: "Checklist when the primary DB degrades", steps: ["Check p95 latency on the dashboard", "Verify replica lag under 5s", "Promote replica", "Point apps at new primary", "Post update in Chat #ops"], status: "ACTIVE" },
        { workspaceId, createdById: adminId, title: "New hire onboarding", description: "Day-one setup for a new teammate", steps: ["Add to Groups", "Create mailbox + labels", "Assign onboarding tasks", "Schedule intro meet", "Enroll laptop in Endpoint Management"], status: "ACTIVE" },
      ],
    });
    await prisma.incident.createMany({
      data: [
        { workspaceId, createdById: adminId, title: "Search index lagging", severity: "SEV3", status: "OPEN", summary: "Cloud Search indexing 40% slower since the last schema change" },
        { workspaceId, createdById: ownerId, title: "Meeting stream dropouts", severity: "SEV2", status: "INVESTIGATING", summary: "Intermittent SSE disconnects on Meet for long rooms" },
      ],
    });
  }

  // CUSTOMER EXPERIENCE — tickets
  const ticketCount = await prisma.ticket.count({ where: { workspaceId } });
  if (ticketCount === 0) {
    const t1 = await prisma.ticket.create({
      data: { workspaceId, createdById: ownerId, requesterName: "Dana Vogel", requesterEmail: "dana@acme.corp", subject: "Can't export sheets to CSV", description: "The export button on the Q3 budget sheet does nothing in Firefox.", priority: "HIGH", status: "OPEN" },
    });
    await prisma.ticket.create({
      data: { workspaceId, createdById: ownerId, requesterName: "Ravi Patel", requesterEmail: "ravi@globex.io", subject: "Billing question — annual plan", description: "We'd like to move to annual billing; can you quote the discount?", priority: "LOW", status: "WAITING" },
    });
    await prisma.ticket.create({
      data: { workspaceId, createdById: adminId, requesterName: "Nina Torres", requesterEmail: "nina@initech.co", subject: "Vault reveal is blank", description: "Revealing a vault entry shows empty value.", priority: "URGENT", status: "RESOLVED" },
    });
    await prisma.ticketReply.create({
      data: { ticketId: t1.id, workspaceId, authorId: ownerId, body: "Thanks Dana — we're on it. Can you share the browser console output? We suspect a Firefox-specific event handler." },
    });
  }

  // SALES — pipeline deals
  const dealCount = await prisma.deal.count({ where: { workspaceId } });
  if (dealCount === 0) {
    await prisma.deal.createMany({
      data: [
        { workspaceId, createdById: ownerId, title: "Acme expansion — 200 seats", company: "Acme Corp", stage: "NEGOTIATION", valueCents: 96_000_00, closeDate: new Date(Date.now() + 12 * 86_400_000) },
        { workspaceId, createdById: ownerId, title: "Globex pilot", company: "Globex Inc", stage: "PROPOSAL", valueCents: 12_000_00 },
        { workspaceId, createdById: ownerId, title: "Initech annual renewal", company: "Initech", stage: "WON", valueCents: 30_000_00, closeDate: new Date(Date.now() - 20 * 86_400_000) },
        { workspaceId, createdById: adminId, title: "Stark enterprise bundle", company: "Stark Industries", stage: "QUALIFIED", valueCents: 240_000_00 },
        { workspaceId, createdById: adminId, title: "Hooli logo deal", company: "Hooli", stage: "LOST", valueCents: 60_000_00, closeDate: new Date(Date.now() - 45 * 86_400_000) },
      ],
    });
  }

  // REVENUE — subscriptions and payments
  const subCount = await prisma.subscription.count({ where: { workspaceId } });
  if (subCount === 0) {
    const pro = await prisma.subscription.create({ data: { workspaceId, createdById: ownerId, plan: "Pro annual", mrrCents: 4_200_00, status: "ACTIVE", startedAt: new Date(Date.now() - 180 * 86_400_000) } });
    await prisma.subscription.create({ data: { workspaceId, createdById: ownerId, plan: "Starter trial", mrrCents: 0, status: "TRIAL", startedAt: new Date(Date.now() - 6 * 86_400_000) } });
    await prisma.subscription.create({ data: { workspaceId, createdById: adminId, plan: "Legacy", mrrCents: 1_000_00, status: "CHURNED", startedAt: new Date(Date.now() - 400 * 86_400_000), canceledAt: new Date(Date.now() - 60 * 86_400_000) } });
    await prisma.payment.createMany({
      data: [
        { workspaceId, subscriptionId: pro.id, createdById: ownerId, amountCents: 4_200_00, method: "card", status: "SUCCEEDED", occurredAt: new Date(Date.now() - 30 * 86_400_000) },
        { workspaceId, subscriptionId: pro.id, createdById: ownerId, amountCents: 4_200_00, method: "card", status: "SUCCEEDED", occurredAt: new Date(Date.now() - 60 * 86_400_000) },
        { workspaceId, createdById: ownerId, amountCents: 8_500_00, method: "wire", status: "SUCCEEDED", occurredAt: new Date(Date.now() - 3 * 86_400_000) },
        { workspaceId, createdById: adminId, amountCents: 500_00, method: "card", status: "FAILED", occurredAt: new Date(Date.now() - 1 * 86_400_000) },
      ],
    });
  }

  // ADS & MARKETING — campaigns
  const campaignCount = await prisma.campaign.count({ where: { workspaceId } });
  if (campaignCount === 0) {
    await prisma.campaign.createMany({
      data: [
        { workspaceId, createdById: ownerId, name: "Q3 launch push", channel: "SOCIAL", budgetCents: 50_000_00, spentCents: 18_400_00, impressions: 84_200, clicks: 2_130, conversions: 128, status: "RUNNING", startsAt: new Date(Date.now() - 12 * 86_400_000), endsAt: new Date(Date.now() + 18 * 86_400_000) },
        { workspaceId, createdById: ownerId, name: "Search — enterprise keywords", channel: "SEARCH", budgetCents: 30_000_00, spentCents: 30_000_00, impressions: 61_500, clicks: 1_890, conversions: 74, status: "COMPLETED" },
        { workspaceId, createdById: adminId, name: "Retention emails", channel: "EMAIL", budgetCents: 8_000_00, spentCents: 1_100_00, impressions: 12_000, clicks: 240, conversions: 11, status: "PAUSED" },
        { workspaceId, createdById: adminId, name: "Display retargeting", channel: "DISPLAY", budgetCents: 20_000_00, spentCents: 0, impressions: 0, clicks: 0, conversions: 0, status: "DRAFT" },
      ],
    });
  }

  // HEALTH — check-ins
  const healthCount = await prisma.healthCheckin.count({ where: { workspaceId } });
  if (healthCount === 0) {
    await prisma.healthCheckin.createMany({
      data: [
        { workspaceId, createdById: ownerId, mood: "GOOD", energy: "HIGH", sleepHours: 7.5, note: "Shipping phase 4 modules", createdAt: new Date(Date.now() - 20 * 3600_000) },
        { workspaceId, createdById: adminId, mood: "OK", energy: "OK", sleepHours: 6.5, note: "Late night on migrations", createdAt: new Date(Date.now() - 26 * 3600_000) },
        { workspaceId, createdById: ownerId, mood: "GREAT", energy: "HIGH", sleepHours: 8, note: "", createdAt: new Date(Date.now() - 44 * 3600_000) },
        { workspaceId, createdById: ownerId, mood: "OK", energy: "LOW", sleepHours: 5.5, note: "Rough Monday", createdAt: new Date(Date.now() - 68 * 3600_000) },
      ],
    });
  }
}

async function seedPhase6Demo(workspaceId: string, ownerId: string) {
  // CALENDAR — recurring + all-day
  if ((await prisma.calendarEvent.count({ where: { workspaceId, recurrence: { not: "NONE" } } })) === 0) {
    await prisma.calendarEvent.create({
      data: {
        workspaceId, createdById: ownerId, title: "Weekly product sync",
        description: "Suite-wide roadmap check", startAt: new Date(Date.now() + 2 * 86_400_000),
        endAt: new Date(Date.now() + 2 * 86_400_000 + 3600_000), recurrence: "WEEKLY",
        repeatUntil: new Date(Date.now() + 60 * 86_400_000),
      },
    });
  }

  // VAULT — category + expiry
  const vaultItems = await prisma.vaultEntry.findMany({ where: { workspaceId } });
  if (vaultItems.length > 0 && vaultItems.every((v) => v.category === "general")) {
    const first = vaultItems[0];
    if (first) await prisma.vaultEntry.update({ where: { id: first.id }, data: { category: "api-keys", expiresAt: new Date(Date.now() + 30 * 86_400_000) } });
  }

  // REVENUE — renewal dates
  await prisma.subscription.updateMany({
    where: { workspaceId, plan: { contains: "Pro" } },
    data: { nextBillingAt: new Date(Date.now() + 28 * 86_400_000) },
  });

  // CX — CSAT on an existing ticket
  const resolvedTicket = await prisma.ticket.findFirst({ where: { workspaceId, status: "RESOLVED" } });
  if (resolvedTicket && resolvedTicket.csat === null) {
    await prisma.ticket.update({ where: { id: resolvedTicket.id }, data: { csat: 4, resolvedAt: resolvedTicket.updatedAt } });
  }

  // VOICE — note + favorite
  const call = await prisma.callLog.findFirst({ where: { workspaceId } });
  if (call && call.note === "") {
    await prisma.callLog.update({ where: { id: call.id }, data: { note: "Discussed phase 5 scope", favorite: true } });
  }

  // PICS — favorite
  const photo = await prisma.photo.findFirst({ where: { workspaceId } });
  if (photo) await prisma.photo.update({ where: { id: photo.id }, data: { favorite: true } });

  // SLIDES — speaker notes
  const slide = await prisma.slide.findFirst({ where: { workspaceId } });
  if (slide && slide.notes === "") {
    await prisma.slide.update({ where: { id: slide.id }, data: { notes: "Pause here — demo the live pipeline totals." } });
  }

  // SALES — deal note
  const deal = await prisma.deal.findFirst({ where: { workspaceId, stage: { notIn: ["WON", "LOST"] } } });
  if (deal && (await prisma.dealNote.count({ where: { dealId: deal.id } })) === 0) {
    await prisma.dealNote.create({ data: { dealId: deal.id, workspaceId, createdById: ownerId, body: "Intro call went well — security review scheduled for next week." } });
  }

  // OPS — incident update
  const incident = await prisma.incident.findFirst({ where: { workspaceId, status: "INVESTIGATING" } });
  if (incident && (await prisma.incidentUpdate.count({ where: { incidentId: incident.id } })) === 0) {
    await prisma.incidentUpdate.create({ data: { incidentId: incident.id, workspaceId, createdById: ownerId, body: "Scaling search replicas; impact contained to query latency." } });
  }

  // LEGAL — revision baseline
  const legal = await prisma.legalDocument.findFirst({ where: { workspaceId } });
  if (legal && (await prisma.legalDocRevision.count({ where: { docId: legal.id } })) === 0) {
    await prisma.legalDocRevision.create({ data: { docId: legal.id, workspaceId, createdById: ownerId, content: legal.content } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());