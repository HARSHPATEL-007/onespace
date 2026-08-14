const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const WS = "96f0f90a-50a8-41e9-854a-d9cd11d432f1";
const U_DEMO = "b3ab4ea6-6ba3-48c5-8d46-023216d88cdc";
const U_ADMIN = "d8a31a78-5dfa-486c-a748-d08a5aa4b06d";
const U_EXT = "a8196d9d-6a40-4f7d-ae46-6ecb98c79fa6";

const rooms = [
  { name: "general", topic: "Team-wide announcements and watercooler" },
  { name: "product", topic: "Roadmap, launches and feedback" },
  { name: "design", topic: "Design reviews and critique" },
  { name: "operations", topic: "Ops rotations, incidents and escalations" },
];

const pool = {
  general: {
    recent: [
      "Morning everyone! Hope you all had a good night's rest.",
      "Great work on the demo yesterday, the team crushed it.",
      "Anyone up for a lunch walk today?",
      "Thanks for the quick feedback on the doc, super helpful.",
      "The new onboarding flow looks really nice, well done.",
      "Appreciate everyone jumping in to help with the migration.",
    ],
    older: [
      "Great work on the demo yesterday, the team crushed it.",
      "The new onboarding flow looks really nice, well done.",
      "Thanks for the quick feedback on the doc, super helpful.",
      "Appreciate everyone jumping in to help with the migration.",
    ],
  },
  product: {
    recent: [
      "The release is looking great, launch on Thursday feels right.",
      "Great feedback from the beta users, they love the new dashboard.",
      "Can we get the pricing page updated before the launch?",
      "Love the new analytics widgets, very clear.",
      "This sprint feels tight, can we trim scope a little?",
      "Excellent demo today, the team nailed it.",
      "Small bug on the signup page, error after submitting the form.",
      "Thanks for the fix, works perfectly now.",
    ],
    older: [
      "Great feedback from the beta users, they love the new dashboard.",
      "Excellent demo today, the team nailed it.",
      "Love the new analytics widgets, very clear.",
      "The release is looking great, launch on Thursday feels right.",
    ],
  },
  design: {
    recent: [
      "I'm frustrated with the color contrast in dark mode.",
      "This hover state is confusing, users will get lost.",
      "We should revisit the modal timing, it feels slow.",
      "The header spacing feels a bit off, can we tighten it?",
    ],
    older: [
      "Love the new icon set, very consistent.",
      "Really impressed with the component library progress.",
      "Nice direction on the empty states, really clean.",
      "The loading skeletons look great, nice touch.",
    ],
  },
  operations: {
    recent: [
      "Incident #4421 is still open, who is on-call tonight?",
      "The queue has been non-stop this week, we are overwhelmed.",
      "Deploy at 22:00 to avoid peak traffic.",
      "Why are we getting paged again for the same alert?",
      "This on-call schedule is brutal, three weekends in a row.",
      "Logs show the retry storm started at 2am, digging in.",
    ],
    older: [
      "Handing over the rotation, summary is in the doc.",
      "Great catch on the disk issue, saved us from an outage.",
      "The queue has been non-stop this week, we are overwhelmed.",
      "Logs show the retry storm started at 2am, digging in.",
    ],
  },
};

const threadPools = {
  product: [
    { title: "Pricing page updates", decisions: ["Ship tier simplification next sprint"], actions: ["Update pricing page copy"] },
    { title: "Beta feedback review", decisions: ["Keep dashboard widgets as-is"], actions: ["Add tooltip for chart exports"] },
  ],
  operations: [
    { title: "Incident 4421 root cause", decisions: ["Auto-scale needs a cooldown window"], actions: ["Patch autoscaler config"] },
  ],
};

function hourAgo(h) {
  return new Date(Date.now() - h * 3_600_000);
}

(async () => {
  await p.chatChannel.deleteMany({ where: { workspaceId: WS, name: { in: rooms.map((r) => r.name) } } });
  await p.environmentalReading.deleteMany({ where: { workspaceId: WS } });
  await p.biometricReading.deleteMany({ where: { workspaceId: WS } });
  await p.biometricConsent.deleteMany({ where: { workspaceId: WS } });
  await p.healthSnapshot.deleteMany({ where: { workspaceId: WS } });
  await p.wellnessIntervention.deleteMany({ where: { workspaceId: WS } });
  const roomIds = {};
  for (const r of rooms) {
    const ch = await p.chatChannel.create({
      data: { workspaceId: WS, name: r.name, topic: r.topic, kind: "CHANNEL", classification: "public", retentionTier: "standard" },
    });
    roomIds[r.name] = ch.id;
    const senders = r.name === "operations" ? [U_DEMO, U_ADMIN] : [U_ADMIN, U_DEMO];
    const members = r.name === "general" ? [U_DEMO, U_ADMIN, U_EXT] : [U_DEMO, U_ADMIN];
    await p.chatMember.createMany({
      data: members.map((userId) => ({ channelId: ch.id, userId, role: "MEMBER", lastReadAt: new Date() })),
    });
    const hasRecentSpike = r.name === "design" || r.name === "operations";
    for (let i = 0; i < 26; i++) {
      const bodyPool = i < 8 ? pool[r.name].recent : pool[r.name].older;
      const body = bodyPool[i % bodyPool.length];
      let created;
      if (i < 8 && hasRecentSpike) created = hourAgo(0.5 + i * 0.6);
      else if (i < 8) created = hourAgo(9 + i * 0.7);
      else if (i < 20) created = hourAgo(9 + (i - 8) * 0.6);
      else created = hourAgo(30 + i * 2);
      const h = r.name === "operations" ? 9 + ((i * 3) % 9) : 9 + ((i * 3) % 9);
      if (i >= 8 || !hasRecentSpike) created.setUTCHours(h, (i * 11) % 60, 0, 0);
      await p.chatMessage.create({
        data: { workspaceId: WS, channelId: ch.id, createdById: senders[i % 2], authorName: senders[i % 2] === U_DEMO ? "demo@n0va.workspace" : "admin@n0va.workspace", body, reactions: "{}", viewedBy: "{}", createdAt: created },
      });
    }
    const tpool = threadPools[r.name];
    if (tpool) {
      for (const t of tpool) {
        const root = await p.chatMessage.create({
          data: { workspaceId: WS, channelId: ch.id, createdById: U_ADMIN, authorName: "admin@n0va.workspace", body: t.title + " — thread kicked off.", reactions: "{}", viewedBy: "{}", createdAt: hourAgo(2) },
        });
        const tm = await p.threadMetadata.create({
          data: { threadId: root.id, rootMessageId: root.id, channelId: ch.id, workspaceId: WS, title: t.title, branchPath: "{}", labels: [], visibility: "ROOM", status: "ACTIVE", lastActivityAt: hourAgo(1), createdAt: hourAgo(2) },
        });
        for (const d of t.decisions) {
          await p.threadDecision.create({
            data: { threadId: tm.id, workspaceId: WS, decisionText: d, confidence: 0.8, status: "CONFIRMED", createdAt: hourAgo(1), updatedAt: hourAgo(1) },
          });
        }
        for (const a of t.actions) {
          await p.threadActionItem.create({
            data: { threadId: tm.id, workspaceId: WS, title: a, status: "OPEN", priority: "MEDIUM", confidence: 0.7, extractedBy: "MANUAL", createdAt: hourAgo(1), updatedAt: hourAgo(1) },
          });
        }
        await p.chatMessage.create({
          data: { workspaceId: WS, channelId: ch.id, createdById: U_DEMO, authorName: "demo@n0va.workspace", body: "Agreed — tracking this in the thread, thanks for the summary.", reactions: "{}", viewedBy: "{}", parentId: root.id, createdAt: hourAgo(1) },
        });
      }
    }
  }

  const envRooms = [
    { roomRef: "general", co2: 520, temperatureC: 21.5, humidity: 45, noiseDb: 48, lightLux: 620, occupancy: 6 },
    { roomRef: "design", co2: 1150, temperatureC: 24.5, humidity: 55, noiseDb: 63, lightLux: 320, occupancy: 4 },
    { roomRef: "operations", co2: 980, temperatureC: 23, humidity: 50, noiseDb: 58, lightLux: 480, occupancy: 5 },
  ];
  const now = Date.now();
  for (const e of envRooms) {
    for (let i = 0; i < 5; i++) {
      await p.environmentalReading.create({
        data: { workspaceId: WS, roomRef: e.roomRef, co2: e.co2 + (i % 3) * 40, temperatureC: e.temperatureC, humidity: e.humidity, noiseDb: e.noiseDb, lightLux: e.lightLux, occupancy: e.occupancy, source: "demo-sensor", recordedAt: new Date(now - i * 2_700_000) },
      });
    }
  }

  const signals = ["hrv", "resting_hr", "sleep", "stress", "activity"];
  for (const uid of [U_DEMO, U_ADMIN, U_EXT]) {
    await p.biometricConsent.upsert({
      where: { workspaceId_userId: { workspaceId: WS, userId: uid } },
      update: {},
      create: { workspaceId: WS, userId: uid, granted: true, signals, sharedWith: ["team"] },
    });
    for (let i = 0; i < 14; i++) {
      await p.biometricReading.create({
        data: {
          workspaceId: WS,
          userId: uid,
          signals: {
            hrv: 38 + ((i * 7 + uid.length) % 20),
            resting_hr: 58 + ((i * 3) % 10),
            sleep: uid === U_EXT ? 5.2 + (i % 3) * 0.6 : 6.8 + (i % 4) * 0.4,
            stress: uid === U_DEMO ? 0.55 + (i % 5) * 0.08 : 0.3 + (i % 4) * 0.05,
            activity: 4000 + i * 220,
          },
          source: "demo-device",
          recordedAt: new Date(now - (13 - i) * 86_400_000),
        },
      });
    }
  }

  console.log("SEEDED rooms: " + Object.keys(roomIds).join(", "));
})().finally(() => p.$disconnect());