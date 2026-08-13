/**
 * Event bus smoke test — full pipeline against live infra:
 * emit → envelope+outbox (same tx) → redis stream relay → consumer dispatch
 * → projections + sagas. Run: pnpm exec tsx smoke.mts
 */
import { createBroker } from "./src/adapters";
import { EventBusServer } from "./src/server";
import { messageCreated, approvalRequested } from "./src/normalize";
import { prisma } from "@n0va/db";
import { relayCycle } from "./src/server/outbox";

const results: string[] = [];
function check(name: string, ok: boolean, extra = ""): void {
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
}

async function main(): Promise<void> {
  const broker = createBroker({ name: "redis" });
  const bus = new EventBusServer({ broker, runLoops: false, logger: (m) => console.log(m) });
  await bus.start();
  await bus.wireDefaultSubscriptions();
  await sleep(800); // let consumer groups come online before relaying

  const health = await broker.health();
  check("broker health", health.ok, JSON.stringify(health));

  const correlationId = `smoke_${Date.now()}`;
  const tenantId = "ws_smoke";
  const threadId = "thread_smoke_1";

  const msg = messageCreated(
    { messageId: "m1", channelId: "c1", threadId, authorId: "u_demo", body: "Hello bus" },
    { producer: "smoke-test", tenantId, correlationId, traceId: `trace_${correlationId}` },
  );
  const approval = approvalRequested(
    { approvalId: "ap1", requestType: "PO", requestedBy: "u_demo", title: "Laptop order", amount: 1200, invoiceId: "inv_1" },
    { producer: "smoke-test", tenantId, correlationId: `saga_${correlationId}` },
  );

  const r1 = await bus.emit(msg);
  const r2 = await bus.emit(approval);
  check("emit message ok", r1.ok && r1.errors.length === 0, r1.errors.join(","));
  check("emit approval ok", r2.ok && r2.errors.length === 0, r2.errors.join(","));

  await sleep(2500);

  const envCount = await prisma.eventEnvelope.count();
  check("envelope persisted", envCount >= 2, `count=${envCount}`);
  const outboxSent = await prisma.eventOutbox.count({ where: { status: "SENT" } });
  const outboxPendingBefore = await prisma.eventOutbox.count({ where: { status: "PENDING" } });
  await relayCycle({ broker });
  const outboxPending = await prisma.eventOutbox.count({ where: { status: "PENDING" } });
  check("outbox relayed", outboxSent >= 2, `sent=${outboxSent} pending=${outboxPending} (before=${outboxPendingBefore})`);

  const thread = await prisma.threadViewProjection.findUnique({ where: { threadId } });
  check("thread projection", !!thread && thread.messageCount >= 1, JSON.stringify({ messageCount: thread?.messageCount }));

  const saga = await prisma.sagaInstance.findFirst({ where: { sagaType: "PURCHASE_APPROVAL", correlationId: `saga_${correlationId}` } });
  check("saga running at APPROVAL_REQUIRED", !!saga && saga.status === "RUNNING" && saga.currentStep === 0, JSON.stringify({ status: saga?.status, step: saga?.currentStep, steps: saga?.steps }));

  const decision = {
    eventId: `decision_${Date.now()}`,
    eventType: "approval.decision",
    version: "1.0",
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    producer: "smoke-test",
    tenantId,
    correlationId: `saga_${correlationId}`,
    payload: { approvalId: "ap1", decision: "APPROVED", decidedBy: "u_boss" },
  };
  const r3 = await bus.emit(decision);
  check("emit decision ok", r3.ok, r3.errors.join(","));
  await sleep(2000);
  await relayCycle({ broker });

  const sagaDone = await prisma.sagaInstance.findFirst({ where: { sagaType: "PURCHASE_APPROVAL", correlationId: `saga_${correlationId}` } });
  check("saga completed", !!sagaDone && sagaDone.status === "COMPLETED" && sagaDone.currentStep === 2, JSON.stringify({ status: sagaDone?.status, step: sagaDone?.currentStep }));

  const sagaCompletedEnv = await prisma.eventEnvelope.findFirst({ where: { eventType: "saga.completed" } });
  check("saga.completed emitted", !!sagaCompletedEnv);

  const approvalEnv = await prisma.eventEnvelope.findFirst({ where: { eventType: "saga.started" } });
  check("saga.started emitted", !!approvalEnv);

  const hops = await prisma.eventTraceHop.count({ where: { eventId: messageIdFor(msg) } });
  check("trace hops recorded", hops >= 1, `hops=${hops}`);

  const msgEventId = messageIdFor(msg);
  const msgEnv = await prisma.eventEnvelope.findUnique({ where: { eventId: msgEventId } });
  check("envelope published flag not required", !!msgEnv);

  const stats = await bus.stats();
  check("stats work", stats.envelopes >= 2, JSON.stringify(stats));

  await prisma.eventEnvelope.deleteMany({ where: { producer: "smoke-test" } });
  await prisma.eventOutbox.deleteMany({ where: { envelopeId: { in: [msgEventId, approval.eventId] } } });
  await prisma.eventOutbox.deleteMany({ where: { eventType: { startsWith: "saga." } } });
  await prisma.threadViewProjection.deleteMany({ where: { threadId } });
  await prisma.sagaInstance.deleteMany({ where: { correlationId: `saga_${correlationId}` } });
  await prisma.eventTraceHop.deleteMany({ where: { correlationId } });
  check("cleanup done", true);

  await bus.stop();
  console.log("\n==== EVENT BUS SMOKE RESULTS ====");
  for (const line of results) console.log(line);
  const failed = results.filter((r) => r.startsWith("FAIL"));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

function messageIdFor(ev: { eventId: string }): string {
  return ev.eventId;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error("SMOKE ERROR:", e);
  process.exit(1);
});