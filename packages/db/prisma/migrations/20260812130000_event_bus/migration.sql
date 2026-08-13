-- Event Bus (Project Nexus): canonical envelope, outbox, idempotency,
-- trace, DLQ, sagas, projections, subscriptions. Self-contained migration
-- (guarded creates) so it applies on any state of the database.

DO $$ BEGIN
  CREATE TYPE "EventVisibility" AS ENUM ('INTERNAL', 'EXTERNAL', 'CONFIDENTIAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE "EventOutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DLQ');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE "SagaStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'COMPENSATED');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE "DLQStatus" AS ENUM ('QUARANTINED', 'REQUEUED', 'DROPPED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TABLE "EventEnvelope" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "producer" TEXT NOT NULL,
    "tenantId" TEXT,
    "aggregateId" TEXT,
    "correlationId" TEXT,
    "causationId" TEXT,
    "traceId" TEXT,
    "idempotencyKey" TEXT,
    "partitionKey" TEXT,
    "visibility" "EventVisibility" NOT NULL DEFAULT 'INTERNAL',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "consumedHops" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventEnvelope_pkey" PRIMARY KEY ("id")
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TABLE "EventOutbox" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "envelopeId" TEXT,
    "tenantId" TEXT,
    "eventType" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "broker" TEXT NOT NULL DEFAULT 'memory',
    "envelope" JSONB NOT NULL DEFAULT '{}',
    "status" "EventOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "error" TEXT,
    "enqueuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventOutbox_pkey" PRIMARY KEY ("id")
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "handlerKey" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "effect" TEXT,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TABLE "EventTraceHop" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "correlationId" TEXT,
    "eventId" TEXT NOT NULL,
    "producer" TEXT,
    "consumer" TEXT NOT NULL,
    "broker" TEXT,
    "hop" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "latencyMs" INTEGER,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "detail" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventTraceHop_pkey" PRIMARY KEY ("id")
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TABLE "EventDLQ" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "status" "DLQStatus" NOT NULL DEFAULT 'QUARANTINED',
    "quarantinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requeuedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "error" TEXT,
    CONSTRAINT "EventDLQ_pkey" PRIMARY KEY ("id")
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TABLE "SagaInstance" (
    "id" TEXT NOT NULL,
    "sagaType" TEXT NOT NULL,
    "tenantId" TEXT,
    "correlationId" TEXT NOT NULL,
    "title" TEXT,
    "status" "SagaStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "compensationStack" JSONB NOT NULL DEFAULT '[]',
    "history" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SagaInstance_pkey" PRIMARY KEY ("id")
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TABLE "ProjectionCursor" (
    "name" TEXT NOT NULL,
    "lastEventId" TEXT,
    "lastEventAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectionCursor_pkey" PRIMARY KEY ("name")
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TABLE "ThreadViewProjection" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "tenantId" TEXT,
    "channelId" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "participantIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "decisionCount" INTEGER NOT NULL DEFAULT 0,
    "openActionCount" INTEGER NOT NULL DEFAULT 0,
    "lastSpeakerId" TEXT,
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ThreadViewProjection_pkey" PRIMARY KEY ("id")
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TABLE "TaskDashboardProjection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "open" INTEGER NOT NULL DEFAULT 0,
    "inProgress" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "overdue" INTEGER NOT NULL DEFAULT 0,
    "highPriority" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskDashboardProjection_pkey" PRIMARY KEY ("id")
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TABLE "InboxProjectionItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT NOT NULL,
    "sourceEvent" TEXT NOT NULL,
    "sourceId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InboxProjectionItem_pkey" PRIMARY KEY ("id")
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TABLE "ComplianceProjection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "kind" TEXT NOT NULL,
    "objectId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WATCH',
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "linkedEvents" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComplianceProjection_pkey" PRIMARY KEY ("id")
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TABLE "EventSubscription" (
    "id" TEXT NOT NULL,
    "consumerKey" TEXT NOT NULL,
    "eventTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "handlerVersion" INTEGER NOT NULL DEFAULT 1,
    "filterJson" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventSubscription_pkey" PRIMARY KEY ("id")
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "EventEnvelope_eventId_key" ON "EventEnvelope"("eventId");
CREATE UNIQUE INDEX IF NOT EXISTS "EventEnvelope_idempotencyKey_key" ON "EventEnvelope"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "EventEnvelope_eventType_timestamp_idx" ON "EventEnvelope"("eventType", "timestamp");
CREATE INDEX IF NOT EXISTS "EventEnvelope_correlationId_idx" ON "EventEnvelope"("correlationId");
CREATE INDEX IF NOT EXISTS "EventEnvelope_traceId_idx" ON "EventEnvelope"("traceId");
CREATE INDEX IF NOT EXISTS "EventEnvelope_aggregateId_idx" ON "EventEnvelope"("aggregateId");
CREATE INDEX IF NOT EXISTS "EventEnvelope_tenantId_idx" ON "EventEnvelope"("tenantId");

CREATE UNIQUE INDEX IF NOT EXISTS "EventOutbox_eventId_key" ON "EventOutbox"("eventId");
CREATE INDEX IF NOT EXISTS "EventOutbox_status_nextRetryAt_idx" ON "EventOutbox"("status", "nextRetryAt");
CREATE INDEX IF NOT EXISTS "EventOutbox_tenantId_eventType_idx" ON "EventOutbox"("tenantId", "eventType");

CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyRecord_handlerKey_eventId_key" ON "IdempotencyRecord"("handlerKey", "eventId");
CREATE INDEX IF NOT EXISTS "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

CREATE INDEX IF NOT EXISTS "EventTraceHop_traceId_idx" ON "EventTraceHop"("traceId");
CREATE INDEX IF NOT EXISTS "EventTraceHop_correlationId_idx" ON "EventTraceHop"("correlationId");
CREATE INDEX IF NOT EXISTS "EventTraceHop_eventId_idx" ON "EventTraceHop"("eventId");

CREATE UNIQUE INDEX IF NOT EXISTS "EventDLQ_eventId_key" ON "EventDLQ"("eventId");
CREATE INDEX IF NOT EXISTS "EventDLQ_status_idx" ON "EventDLQ"("status");
CREATE INDEX IF NOT EXISTS "EventDLQ_eventType_idx" ON "EventDLQ"("eventType");

CREATE INDEX IF NOT EXISTS "SagaInstance_sagaType_status_idx" ON "SagaInstance"("sagaType", "status");
CREATE INDEX IF NOT EXISTS "SagaInstance_correlationId_idx" ON "SagaInstance"("correlationId");

CREATE UNIQUE INDEX IF NOT EXISTS "ThreadViewProjection_threadId_key" ON "ThreadViewProjection"("threadId");
CREATE INDEX IF NOT EXISTS "ThreadViewProjection_tenantId_idx" ON "ThreadViewProjection"("tenantId");
CREATE INDEX IF NOT EXISTS "ThreadViewProjection_lastActivity_idx" ON "ThreadViewProjection"("lastActivity");

CREATE UNIQUE INDEX IF NOT EXISTS "TaskDashboardProjection_tenantId_assigneeId_key" ON "TaskDashboardProjection"("tenantId", "assigneeId");
CREATE INDEX IF NOT EXISTS "InboxProjectionItem_userId_read_idx" ON "InboxProjectionItem"("userId", "read");
CREATE INDEX IF NOT EXISTS "InboxProjectionItem_tenantId_idx" ON "InboxProjectionItem"("tenantId");
CREATE INDEX IF NOT EXISTS "ComplianceProjection_tenantId_status_idx" ON "ComplianceProjection"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "ComplianceProjection_kind_idx" ON "ComplianceProjection"("kind");

CREATE UNIQUE INDEX IF NOT EXISTS "EventSubscription_consumerKey_key" ON "EventSubscription"("consumerKey");