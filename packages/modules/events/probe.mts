/** Minimal consumer probe for the redis adapter. */
import { createBroker } from "./src/adapters";
import { messageCreated } from "./src/normalize";
import { prisma } from "@n0va/db";
import { emitEvent, relayCycle } from "./src/server/outbox";

async function main(): Promise<void> {
  const broker = createBroker({ name: "redis", logger: (m) => console.log("BROKER:", m) });
  const seen: string[] = [];
  await broker.subscribe(["chat.message.created"], "probe-consumer", async ({ event, retryCount }) => {
    console.log("HANDLER GOT:", event.eventType, event.eventId, "retry", retryCount);
    seen.push(event.eventId);
  });
  console.log("subscribed, waiting 1.5s for consumer loop to start...");
  await sleep(1500);

  const ev = messageCreated({ messageId: "m_probe", channelId: "c1", threadId: "t_probe", authorId: "u1", body: "probe" }, { producer: "probe", tenantId: "ws_probe" });
  const r = await emitEvent(ev, "redis");
  console.log("emit:", JSON.stringify(r));
  const relay = await relayCycle({ broker });
  console.log("relay:", JSON.stringify(relay));
  await sleep(2500);
  console.log("SEEN:", seen.length, seen.join(","));

  await prisma.eventEnvelope.deleteMany({ where: { eventId: ev.eventId } });
  await prisma.eventOutbox.deleteMany({ where: { eventId: ev.eventId } });
  await broker.disconnect();
  process.exit(0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error("PROBE ERROR:", e);
  process.exit(1);
});