-- CreateEnum
CREATE TYPE "ContactPlatform" AS ENUM ('N0VA', 'WHATSAPP', 'TELEGRAM', 'SIGNAL', 'IMESSAGE', 'SMS');

-- CreateEnum
CREATE TYPE "ChatLinkStatus" AS ENUM ('ACTIVE', 'PENDING_INVITE', 'BLOCKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PollStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'FIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliverySemantic" AS ENUM ('AT_MOST_ONCE', 'AT_LEAST_ONCE', 'EFFECTIVELY_ONCE', 'BOUNDED_LOSS');

-- CreateEnum
CREATE TYPE "ChatDeliveryState" AS ENUM ('PENDING', 'SENDING', 'QUEUED', 'DELAYED', 'RETRIED', 'PARTIALLY_DELIVERED', 'FAILED', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChatAttemptOutcome" AS ENUM ('SUCCESS', 'TRANSIENT', 'PERMANENT', 'MALFORMED', 'UNAUTHORIZED', 'QUOTA_DEFERRED', 'QUOTA_EXCEEDED', 'BREAKER_OPEN', 'DEDUPED', 'TIMEOUT', 'DLQ', 'DEFERRED');

-- CreateEnum
CREATE TYPE "ChatBreakerState" AS ENUM ('CLOSED', 'OPEN', 'HALF_OPEN');

-- CreateEnum
CREATE TYPE "ChatDLQStatus" AS ENUM ('QUARANTINED', 'REQUEUED', 'DROPPED', 'RELEASED');

-- CreateEnum
CREATE TYPE "MailStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "MailPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "MailCategory" AS ENUM ('PERSONAL', 'WORK', 'NEWSLETTER', 'NOTIFICATION', 'PROMOTIONAL', 'SPAM');

-- CreateEnum
CREATE TYPE "MailDraftStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING');

-- CreateEnum
CREATE TYPE "MailboxRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MailTier" AS ENUM ('TIER1', 'TIER2', 'TIER3');

-- CreateEnum
CREATE TYPE "EmbedSourceType" AS ENUM ('DOC', 'SHEET', 'CRM_RECORD', 'GITHUB_ITEM', 'TICKET', 'CALENDAR_EVENT', 'TASK', 'IMAGE', 'VIDEO', 'LINK');

-- CreateEnum
CREATE TYPE "MonitorStatus" AS ENUM ('OBSERVED', 'ALERTED', 'ENFORCED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ModerationAction" AS ENUM ('ALLOW', 'FLAG', 'QUARANTINE', 'MASK', 'HIDE', 'SOFT_WARN', 'ESCALATE', 'LOCK_THREAD');

-- CreateEnum
CREATE TYPE "ModerationPolicy" AS ENUM ('AUTO_ENFORCE', 'HUMAN_REVIEW', 'TEAM_THRESHOLD', 'MULTILINGUAL', 'ROLE_AWARE');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ConflictSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ConflictResponse" AS ENUM ('BANNER', 'PRIVATE_NUDGE', 'SUGGEST_HUDDLE', 'MODERATOR_INTERVENTION', 'FREEZE_THREAD');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'FROZEN');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('HEALTHY', 'OVERLOADED', 'STALE', 'CONFLICT_RISK', 'BURNOUT', 'BLOCKED');

-- CreateEnum
CREATE TYPE "InsightKind" AS ENUM ('TOP_TOPIC', 'RECURRING_QUESTION', 'FREQUENT_BLOCKER', 'DECISION_CLUSTER', 'COMMON_OBJECTION', 'UNRESOLVED_ISSUE', 'RESPONSIVENESS_PATTERN', 'SENTIMENT_BY_TOPIC');

-- CreateEnum
CREATE TYPE "FaqStatus" AS ENUM ('CANDIDATE', 'DRAFT', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReplyIntent" AS ENUM ('ACKNOWLEDGEMENT', 'SCHEDULING', 'STATUS_UPDATE', 'DECISION_CONFIRMATION', 'ACTION_TAKEN', 'QUESTION', 'CLARIFICATION');

-- CreateEnum
CREATE TYPE "ReplyTone" AS ENUM ('CONCISE', 'FRIENDLY', 'FORMAL', 'FIRM');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DISMISSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AiTier" AS ENUM ('TIER_0', 'TIER_1', 'TIER_2', 'TIER_3', 'TIER_4');

-- AlterEnum
ALTER TYPE "SearchContentType" ADD VALUE 'STORAGE_ITEM';

-- AlterEnum
ALTER TYPE "ThreadStatus" ADD VALUE 'LOCKED';

-- DropForeignKey
ALTER TABLE "ThreadActionItem" DROP CONSTRAINT "ThreadActionItem_threadId_fkey";

-- DropForeignKey
ALTER TABLE "ThreadBookmark" DROP CONSTRAINT "ThreadBookmark_threadId_fkey";

-- DropForeignKey
ALTER TABLE "ThreadDecision" DROP CONSTRAINT "ThreadDecision_threadId_fkey";

-- DropForeignKey
ALTER TABLE "ThreadExport" DROP CONSTRAINT "ThreadExport_threadId_fkey";

-- DropForeignKey
ALTER TABLE "ThreadPin" DROP CONSTRAINT "ThreadPin_threadId_fkey";

-- DropIndex
DROP INDEX "EmailAccount_workspaceId_idx";

-- DropIndex
DROP INDEX "IntegrationConnection_integrationId_idx";

-- DropIndex
DROP INDEX "IntegrationConnection_integrationId_workspaceId_status_idx";

-- DropIndex
DROP INDEX "IntegrationConnection_workspaceId_idx";

-- DropIndex
DROP INDEX "MailMessage_accountId_idx";

-- DropIndex
DROP INDEX "MailMessage_deliveryStatus_idx";

-- DropIndex
DROP INDEX "Mailbox_workspaceId_idx";

-- DropIndex
DROP INDEX "MailboxMember_mailboxId_idx";

-- AlterTable
ALTER TABLE "AdaptivePaneState" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AniMessage" ADD COLUMN     "citations" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "depth" TEXT NOT NULL DEFAULT 'balanced',
ADD COLUMN     "intent" TEXT NOT NULL DEFAULT 'conversational',
ADD COLUMN     "latencyMs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "thoughtSummary" TEXT,
ADD COLUMN     "tokensIn" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tokensOut" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "toolCalls" TEXT NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "BiometricConsent" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ChatApprovalRequest" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ChatEventProposal" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ChatHyperConfig" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ChatHyperContext" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "lang" TEXT,
ADD COLUMN     "pollId" TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ChatTaskProposal" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ComplianceProjection" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Contact" DROP COLUMN "platform",
ADD COLUMN     "platform" "ContactPlatform" NOT NULL DEFAULT 'N0VA';

-- AlterTable
ALTER TABLE "ContactChatLink" DROP COLUMN "platform",
ADD COLUMN     "platform" "ContactPlatform" NOT NULL DEFAULT 'N0VA',
DROP COLUMN "status",
ADD COLUMN     "status" "ChatLinkStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "EventOutbox" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EventSubscription" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "FederationAuditLog" ALTER COLUMN "connectionId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "HealthSnapshot" ADD COLUMN     "members" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "messages" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "senders" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "InboxProjectionItem" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "IntegrationAccessRequest" ALTER COLUMN "reasoningChain" DROP NOT NULL,
ALTER COLUMN "reasoningChain" DROP DEFAULT;

-- AlterTable
ALTER TABLE "IntegrationConnection" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "authType" DROP DEFAULT,
ALTER COLUMN "allowedScopes" DROP NOT NULL,
ALTER COLUMN "allowedActions" DROP NOT NULL,
ALTER COLUMN "blockedActions" DROP NOT NULL,
ALTER COLUMN "healthScore" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MailMessage" ADD COLUMN     "aiCategory" "MailCategory" NOT NULL DEFAULT 'WORK',
ADD COLUMN     "aiPriority" "MailPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "aiProcessed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiSentiment" TEXT NOT NULL DEFAULT 'neutral',
ADD COLUMN     "aiSummary" TEXT DEFAULT '',
ADD COLUMN     "autoRespond" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bccEmails" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "bodyHtml" TEXT DEFAULT '',
ADD COLUMN     "ccEmails" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "isForwarded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "signatureId" TEXT,
ADD COLUMN     "snoozeUntil" TIMESTAMP(3),
ADD COLUMN     "status" "MailStatus" NOT NULL DEFAULT 'SENT';

-- AlterTable
ALTER TABLE "Mailbox" DROP COLUMN "isShared",
ADD COLUMN     "autoAssign" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "MailboxMember" DROP COLUMN "createdAt",
ADD COLUMN     "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
DROP COLUMN "role",
ADD COLUMN     "role" "MailboxRole" NOT NULL DEFAULT 'MEMBER';

-- AlterTable
ALTER TABLE "NeuralConsentScope" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "NeuralHuddleParticipant" ADD COLUMN     "consentVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "handRaised" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sharedConfidence" DOUBLE PRECISION,
ADD COLUMN     "sharedState" TEXT;

-- AlterTable
ALTER TABLE "NeuralStateRecord" ADD COLUMN     "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "corrected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "selfReport" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "embedding" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PresenceSession" ALTER COLUMN "customStatus" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ProjectionCursor" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SagaInstance" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StorageFileVersion" ADD COLUMN     "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "changeSummary" TEXT,
ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "isLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recallReason" TEXT,
ADD COLUMN     "recalledAt" TIMESTAMP(3),
ADD COLUMN     "recalledById" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'CURRENT',
ADD COLUMN     "versionNumber" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StorageItem" ADD COLUMN     "accessCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "complianceLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "immutable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastAccessedAt" TIMESTAMP(3),
ADD COLUMN     "legalHold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "legalHoldReason" TEXT,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedById" TEXT,
ADD COLUMN     "restrictedDownload" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "retainUntil" TIMESTAMP(3),
ADD COLUMN     "retentionMode" TEXT NOT NULL DEFAULT 'STANDARD';

-- AlterTable
ALTER TABLE "TaskDashboardProjection" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ThreadMetadata" ALTER COLUMN "summaryShort" SET DEFAULT '';

-- AlterTable
ALTER TABLE "ThreadViewProjection" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WellnessIntervention" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "FileIndex" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "itemId" TEXT,
    "versionNumber" INTEGER NOT NULL DEFAULT 0,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extractedText" TEXT,
    "ocrText" TEXT,
    "entities" JSONB NOT NULL DEFAULT '[]',
    "topics" JSONB NOT NULL DEFAULT '[]',
    "indexState" TEXT NOT NULL DEFAULT 'PENDING',
    "indexedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileIndex_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAccessLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "itemId" TEXT,
    "versionId" TEXT,
    "versionNumber" INTEGER,
    "channelId" TEXT,
    "module" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
    "policyApplied" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "hash" TEXT NOT NULL,
    "chainPrev" TEXT,
    "chainIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileLegalHold" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "objectId" TEXT,
    "matterName" TEXT,
    "reason" TEXT NOT NULL,
    "placedById" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "noticeIssuedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "releasedById" TEXT,
    "releasedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FileLegalHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "versionNumber" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "sourceMessageId" TEXT,
    "sourceChannelId" TEXT,
    "requesterId" TEXT NOT NULL,
    "requesterName" TEXT,
    "amountCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "policyRuleId" TEXT,
    "policyRuleName" TEXT,
    "thresholdCents" INTEGER,
    "costCenter" TEXT,
    "rationale" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DETECTED',
    "approverChain" JSONB NOT NULL DEFAULT '[]',
    "currentApproverIndex" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "escalationAt" TIMESTAMP(3),
    "lastRemindedAt" TIMESTAMP(3),
    "decisionAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "decisionById" TEXT,
    "erpReference" TEXT,
    "erpSyncStatus" TEXT NOT NULL DEFAULT 'NOT_SYNCED',
    "erpSyncAttempts" INTEGER NOT NULL DEFAULT 0,
    "erpSyncError" TEXT,
    "retryUntil" TIMESTAMP(3),
    "downstreamStatus" TEXT NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalPolicyRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "minAmountCents" INTEGER,
    "maxAmountCents" INTEGER,
    "costCenter" TEXT,
    "approverRole" TEXT,
    "approverUserId" TEXT,
    "backupUserId" TEXT,
    "slaMinutes" INTEGER NOT NULL DEFAULT 1440,
    "priority" INTEGER NOT NULL DEFAULT 10,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "ApprovalPolicyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalAuditEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "hash" TEXT NOT NULL,
    "chainPrev" TEXT,
    "chainIndex" INTEGER NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalAuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalComment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'COMMENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceApprovalConfig" (
    "workspaceId" TEXT NOT NULL,
    "erpProvider" TEXT NOT NULL DEFAULT 'MOCK',
    "erpIntegrationId" TEXT,
    "autoRaiseThresholdCents" INTEGER,
    "defaultSlaMinutes" INTEGER NOT NULL DEFAULT 1440,
    "nudgeBeforeMinutes" INTEGER NOT NULL DEFAULT 120,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceApprovalConfig_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "description" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalId" TEXT,
    "requestedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSchedule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "poId" TEXT,
    "invoiceId" TEXT,
    "approvalId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatPoll" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT NOT NULL,
    "status" "PollStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "messageId" TEXT,

    CONSTRAINT "ChatPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatPollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatPollVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "channelId" TEXT,
    "sourceMessageId" TEXT,
    "targetUserId" TEXT,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "firedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatDeliveryPolicy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelKind" TEXT NOT NULL DEFAULT 'CHANNEL',
    "target" TEXT NOT NULL DEFAULT 'chat',
    "deliverySemantic" "DeliverySemantic" NOT NULL DEFAULT 'AT_LEAST_ONCE',
    "latencyTargetMs" INTEGER NOT NULL DEFAULT 5000,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "retryMaxAttempts" INTEGER NOT NULL DEFAULT 5,
    "retryBackoff" TEXT NOT NULL DEFAULT 'EXPONENTIAL_JITTER',
    "retryMaxDurationSec" INTEGER NOT NULL DEFAULT 300,
    "breakerEnabled" BOOLEAN NOT NULL DEFAULT true,
    "breakerFailureThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "breakerWindowMs" INTEGER NOT NULL DEFAULT 60000,
    "breakerCooldownSec" INTEGER NOT NULL DEFAULT 60,
    "breakerHalfOpenProbes" INTEGER NOT NULL DEFAULT 1,
    "quotaEnabled" BOOLEAN NOT NULL DEFAULT true,
    "quotaTenantDailyLimit" INTEGER NOT NULL DEFAULT 10000,
    "quotaTenantHourlyLimit" INTEGER NOT NULL DEFAULT 2000,
    "quotaBurstLimit" INTEGER NOT NULL DEFAULT 50,
    "quotaBudgetCost" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatDeliveryPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessageDelivery" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT 'chat',
    "channelKind" TEXT NOT NULL DEFAULT 'CHANNEL',
    "state" "ChatDeliveryState" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "correlationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "targetCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "lastOutcome" "ChatAttemptOutcome",
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "enqueuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "queueWaitMs" INTEGER,
    "totalLatencyMs" INTEGER,
    "dedupHit" BOOLEAN NOT NULL DEFAULT false,
    "dlqId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatMessageDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "outcome" "ChatAttemptOutcome" NOT NULL,
    "reason" TEXT,
    "latencyMs" INTEGER,
    "breakerState" "ChatBreakerState",
    "quotaConsumed" INTEGER NOT NULL DEFAULT 0,
    "queueWaitMs" INTEGER,
    "retryAfterMs" INTEGER,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatBreaker" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "path" TEXT NOT NULL DEFAULT 'write',
    "state" "ChatBreakerState" NOT NULL DEFAULT 'CLOSED',
    "failures" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "cooldownUntil" TIMESTAMP(3),
    "halfOpenProbes" INTEGER NOT NULL DEFAULT 0,
    "lastProbeAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatBreaker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatQuotaCounter" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used" INTEGER NOT NULL DEFAULT 0,
    "burstUsed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatQuotaCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatDeliveryDLQ" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "deliveryId" TEXT,
    "channelId" TEXT,
    "messageId" TEXT,
    "target" TEXT NOT NULL DEFAULT 'chat',
    "reasonCode" TEXT NOT NULL,
    "reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "ChatDLQStatus" NOT NULL DEFAULT 'QUARANTINED',
    "quarantinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requeueAt" TIMESTAMP(3),
    "requeuedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "ChatDeliveryDLQ_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatPersonalizationProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "prioritySort" TEXT NOT NULL DEFAULT 'ACTIONABILITY_RECENCY',
    "digestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "workingHoursStart" INTEGER NOT NULL DEFAULT 540,
    "workingHoursEnd" INTEGER NOT NULL DEFAULT 1020,
    "workdays" TEXT NOT NULL DEFAULT '["mon","tue","wed","thu","fri"]',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "calendarAwareDnd" BOOLEAN NOT NULL DEFAULT false,
    "aiSuggestionsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pauseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatPersonalizationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatNotificationRule" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "urgency" INTEGER NOT NULL DEFAULT 0,
    "bypassDnd" BOOLEAN NOT NULL DEFAULT false,
    "snoozeUntil" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'USER',
    "reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatNotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatDndWindow" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "days" TEXT NOT NULL DEFAULT '[]',
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "calendarEventId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatDndWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatPinnedItem" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "pinUntil" TIMESTAMP(3),
    "pinUntilResolved" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatPinnedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatWorkspaceDefaultRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "urgency" INTEGER NOT NULL DEFAULT 0,
    "bypassDnd" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatWorkspaceDefaultRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatPreferenceEvent" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "messageId" TEXT,
    "roomId" TEXT,
    "channelType" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatPreferenceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NeuralProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 0,
    "calibration" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NeuralProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NeuralSharing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "personIds" TEXT NOT NULL DEFAULT '[]',
    "roomId" TEXT,
    "precision" TEXT NOT NULL DEFAULT 'COARSE',
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "NeuralSharing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NeuralCommand" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "huddleId" TEXT,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "decoded" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NeuralCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NeuralAccessLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NeuralAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailThread" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "folder" "MailFolder" NOT NULL DEFAULT 'INBOX',
    "subject" TEXT NOT NULL DEFAULT '(no subject)',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isStarred" BOOLEAN NOT NULL DEFAULT false,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "participants" JSONB NOT NULL DEFAULT '[]',
    "latestSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latestMsgId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailDraft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "subject" TEXT NOT NULL DEFAULT '(no subject)',
    "toEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ccEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "body" TEXT NOT NULL DEFAULT '',
    "status" "MailDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "threadId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "lastRunAt" TIMESTAMP(3),
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailAttachment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailDomain" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "domain" TEXT NOT NULL,
    "dkimKey" TEXT,
    "spfRecord" TEXT,
    "dmarcPolicy" TEXT,
    "mtaSts" TEXT,
    "tlsRpt" TEXT,
    "bimiUrl" TEXT,
    "mxRecords" JSONB NOT NULL DEFAULT '[]',
    "privacyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "registrar" TEXT NOT NULL DEFAULT '',
    "whoisProxy" BOOLEAN NOT NULL DEFAULT true,
    "catchAllEnabled" BOOLEAN NOT NULL DEFAULT true,
    "catchAllTarget" TEXT NOT NULL DEFAULT '',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "healthStatus" TEXT NOT NULL DEFAULT 'unknown',
    "lastChecked" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DnsRecord" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DnsRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAlias" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "localPart" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "forwardTo" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isWildcard" BOOLEAN NOT NULL DEFAULT false,
    "spamFilter" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReverseAlias" (
    "id" TEXT NOT NULL,
    "aliasId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "relayAddress" TEXT NOT NULL,
    "targetEmail" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReverseAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreachEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "aliasEmail" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "details" TEXT NOT NULL DEFAULT '',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BreachEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailContact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "company" TEXT NOT NULL DEFAULT '',
    "jobTitle" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailSignature" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "contentHtml" TEXT DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailAutoResponder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "subject" TEXT NOT NULL DEFAULT 'Out of Office',
    "body" TEXT NOT NULL DEFAULT 'I am currently out of office.',
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailAutoResponder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailUserFolder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "name" TEXT NOT NULL,
    "parentFolderId" TEXT,
    "color" TEXT NOT NULL DEFAULT '#7c5cfc',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailUserFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailComment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isResolve" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailDelegation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "delegatorId" TEXT NOT NULL,
    "delegateId" TEXT NOT NULL,
    "canSend" BOOLEAN NOT NULL DEFAULT true,
    "canRead" BOOLEAN NOT NULL DEFAULT true,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailDelegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailTask" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdById" TEXT,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "MailPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMP(3),
    "listId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailSharedDraft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT,
    "createdById" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "bodyHtml" TEXT DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailSharedDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailSharedDraftCollaborator" (
    "id" TEXT NOT NULL,
    "sharedDraftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailSharedDraftCollaborator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailRoutingRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "tier" "MailTier" NOT NULL DEFAULT 'TIER2',
    "condition" TEXT NOT NULL,
    "matchValue" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actionValue" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailRoutingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailInboxSecurity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "masterEmail" TEXT NOT NULL DEFAULT '',
    "provider" TEXT NOT NULL DEFAULT '',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaType" TEXT NOT NULL DEFAULT 'totp',
    "hardwareKey" BOOLEAN NOT NULL DEFAULT false,
    "passphraseHint" TEXT NOT NULL DEFAULT '',
    "recoveryEmail" TEXT NOT NULL DEFAULT '',
    "lastSecurityCheck" TIMESTAMP(3),
    "securityScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailInboxSecurity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailSecurityEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "source" TEXT NOT NULL DEFAULT '',
    "aliasEmail" TEXT NOT NULL DEFAULT '',
    "details" TEXT NOT NULL DEFAULT '',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "isResolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MailSecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorCircuit" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'CLOSED',
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3),
    "cooldownUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorCircuit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorEventLog" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT,
    "workspaceId" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'OUTBOUND',
    "canonicalObject" TEXT,
    "actionType" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "provenance" JSONB,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ConnectorEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorSyncCheckpoint" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "cursor" JSONB NOT NULL DEFAULT '{}',
    "conflictPolicy" TEXT NOT NULL DEFAULT 'LWW',
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,

    CONSTRAINT "ConnectorSyncCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AniMemoryMark" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'fact',
    "content" TEXT NOT NULL,
    "context" TEXT NOT NULL DEFAULT '',
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AniMemoryMark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AniLearningProgress" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "totalSteps" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AniLearningProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AniOutcome" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "timeSavedMs" INTEGER NOT NULL DEFAULT 0,
    "decisionQuality" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "followThrough" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "satisfaction" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "completionRate" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "notes" TEXT,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AniOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AniMeetingSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Meeting',
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "participants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "decisionsCount" INTEGER NOT NULL DEFAULT 0,
    "actionItemsCount" INTEGER NOT NULL DEFAULT 0,
    "transcript" TEXT NOT NULL DEFAULT '',
    "engagement" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "sentiment" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "durationMin" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "AniMeetingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AniConsciousnessSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "coherence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "cognitiveLoad" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "flowState" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "stressLevel" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "engagement" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hallucinationRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AniConsciousnessSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveEmbed" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT,
    "sourceType" "EmbedSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "url" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveEmbed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresentationSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "startedById" TEXT NOT NULL,
    "channelId" TEXT,
    "title" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "PresentationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubVocalConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "confidenceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "showConfidence" BOOLEAN NOT NULL DEFAULT true,
    "ephemeralConfirm" BOOLEAN NOT NULL DEFAULT true,
    "sessionKey" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubVocalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMonitor" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT,
    "threadId" TEXT,
    "messageId" TEXT,
    "signals" JSONB NOT NULL DEFAULT '{}',
    "insights" JSONB NOT NULL DEFAULT '{}',
    "actions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "MonitorStatus" NOT NULL DEFAULT 'OBSERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationMonitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentimentRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT,
    "threadId" TEXT,
    "messageId" TEXT,
    "senderId" TEXT,
    "topic" TEXT,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentimentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToxicityFlag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT,
    "threadId" TEXT,
    "messageId" TEXT,
    "senderId" TEXT,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "action" "ModerationAction" NOT NULL DEFAULT 'ALLOW',
    "policy" "ModerationPolicy" NOT NULL DEFAULT 'HUMAN_REVIEW',
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToxicityFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConflictAlert" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT,
    "threadId" TEXT,
    "severity" "ConflictSeverity" NOT NULL DEFAULT 'LOW',
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "signals" JSONB NOT NULL DEFAULT '{}',
    "response" "ConflictResponse" NOT NULL DEFAULT 'BANNER',
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "frozenUntil" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConflictAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT,
    "threadId" TEXT,
    "scope" TEXT NOT NULL,
    "messageVelocity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "participationDiversity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "replyLatencySec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unansweredQuestions" INTEGER NOT NULL DEFAULT 0,
    "threadResolutionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "activeContributorRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conflictToResolutionRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sentimentTrend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "focusScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "burnoutRisk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "healthScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "HealthStatus" NOT NULL DEFAULT 'HEALTHY',
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationInsight" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT,
    "kind" "InsightKind" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "explanation" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supportingThreads" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "topic" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaqEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "shortAnswer" TEXT NOT NULL,
    "sourceThreads" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceMessages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "FaqStatus" NOT NULL DEFAULT 'CANDIDATE',
    "ownerId" TEXT,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaqEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpertProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "resolutionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "firstResponseSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "endorsements" INTEGER NOT NULL DEFAULT 0,
    "domainVocabScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taskOwnership" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "availability" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpertProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartReplySuggestion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "channelId" TEXT,
    "threadId" TEXT,
    "intent" "ReplyIntent" NOT NULL,
    "tone" "ReplyTone" NOT NULL,
    "body" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "styleMatch" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "knowledgeBased" BOOLEAN NOT NULL DEFAULT false,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmartReplySuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiTierConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "tier" "AiTier" NOT NULL,
    "monitoringEnabled" BOOLEAN NOT NULL DEFAULT false,
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "roleAwareSeverity" BOOLEAN NOT NULL DEFAULT false,
    "multilingual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiTierConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "flagId" TEXT,
    "action" "ModerationAction" NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileIndex_workspaceId_indexState_idx" ON "FileIndex"("workspaceId", "indexState");

-- CreateIndex
CREATE UNIQUE INDEX "FileIndex_workspaceId_objectType_objectId_key" ON "FileIndex"("workspaceId", "objectType", "objectId");

-- CreateIndex
CREATE INDEX "FileAccessLog_workspaceId_createdAt_idx" ON "FileAccessLog"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "FileAccessLog_objectId_idx" ON "FileAccessLog"("objectId");

-- CreateIndex
CREATE INDEX "FileAccessLog_workspaceId_action_idx" ON "FileAccessLog"("workspaceId", "action");

-- CreateIndex
CREATE INDEX "FileLegalHold_workspaceId_active_idx" ON "FileLegalHold"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "FileLegalHold_objectId_idx" ON "FileLegalHold"("objectId");

-- CreateIndex
CREATE INDEX "FileLink_objectType_objectId_idx" ON "FileLink"("objectType", "objectId");

-- CreateIndex
CREATE INDEX "FileLink_itemId_idx" ON "FileLink"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "FileLink_itemId_objectType_objectId_versionNumber_key" ON "FileLink"("itemId", "objectType", "objectId", "versionNumber");

-- CreateIndex
CREATE INDEX "ApprovalRequest_workspaceId_status_idx" ON "ApprovalRequest"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ApprovalRequest_workspaceId_sourceChannelId_status_idx" ON "ApprovalRequest"("workspaceId", "sourceChannelId", "status");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_dueAt_idx" ON "ApprovalRequest"("status", "dueAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_workspaceId_erpSyncStatus_idx" ON "ApprovalRequest"("workspaceId", "erpSyncStatus");

-- CreateIndex
CREATE INDEX "ApprovalPolicyRule_workspaceId_active_requestType_idx" ON "ApprovalPolicyRule"("workspaceId", "active", "requestType");

-- CreateIndex
CREATE INDEX "ApprovalAuditEntry_approvalId_chainIndex_idx" ON "ApprovalAuditEntry"("approvalId", "chainIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalAuditEntry_workspaceId_chainIndex_key" ON "ApprovalAuditEntry"("workspaceId", "chainIndex");

-- CreateIndex
CREATE INDEX "ApprovalComment_approvalId_idx" ON "ApprovalComment"("approvalId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_workspaceId_status_idx" ON "PurchaseOrder"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "PaymentSchedule_workspaceId_status_idx" ON "PaymentSchedule"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ChatPoll_messageId_key" ON "ChatPoll"("messageId");

-- CreateIndex
CREATE INDEX "ChatPoll_workspaceId_channelId_createdAt_idx" ON "ChatPoll"("workspaceId", "channelId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ChatPollVote_pollId_idx" ON "ChatPollVote"("pollId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatPollVote_pollId_userId_key" ON "ChatPollVote"("pollId", "userId");

-- CreateIndex
CREATE INDEX "Reminder_userId_status_remindAt_idx" ON "Reminder"("userId", "status", "remindAt");

-- CreateIndex
CREATE INDEX "Reminder_workspaceId_status_idx" ON "Reminder"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ChatDeliveryPolicy_workspaceId_active_idx" ON "ChatDeliveryPolicy"("workspaceId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ChatDeliveryPolicy_workspaceId_channelKind_target_key" ON "ChatDeliveryPolicy"("workspaceId", "channelKind", "target");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessageDelivery_idempotencyKey_key" ON "ChatMessageDelivery"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessageDelivery_dlqId_key" ON "ChatMessageDelivery"("dlqId");

-- CreateIndex
CREATE INDEX "ChatMessageDelivery_channelId_state_idx" ON "ChatMessageDelivery"("channelId", "state");

-- CreateIndex
CREATE INDEX "ChatMessageDelivery_workspaceId_state_nextRetryAt_idx" ON "ChatMessageDelivery"("workspaceId", "state", "nextRetryAt");

-- CreateIndex
CREATE INDEX "ChatDeliveryAttempt_deliveryId_attempt_idx" ON "ChatDeliveryAttempt"("deliveryId", "attempt");

-- CreateIndex
CREATE INDEX "ChatDeliveryAttempt_workspaceId_at_idx" ON "ChatDeliveryAttempt"("workspaceId", "at" DESC);

-- CreateIndex
CREATE INDEX "ChatBreaker_workspaceId_idx" ON "ChatBreaker"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatBreaker_workspaceId_target_path_key" ON "ChatBreaker"("workspaceId", "target", "path");

-- CreateIndex
CREATE INDEX "ChatQuotaCounter_workspaceId_idx" ON "ChatQuotaCounter"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatQuotaCounter_workspaceId_scope_scopeKey_bucket_key" ON "ChatQuotaCounter"("workspaceId", "scope", "scopeKey", "bucket");

-- CreateIndex
CREATE UNIQUE INDEX "ChatDeliveryDLQ_deliveryId_key" ON "ChatDeliveryDLQ"("deliveryId");

-- CreateIndex
CREATE INDEX "ChatDeliveryDLQ_status_idx" ON "ChatDeliveryDLQ"("status");

-- CreateIndex
CREATE INDEX "ChatDeliveryDLQ_workspaceId_status_idx" ON "ChatDeliveryDLQ"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ChatDeliveryDLQ_requeueAt_idx" ON "ChatDeliveryDLQ"("requeueAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatPersonalizationProfile_userId_key" ON "ChatPersonalizationProfile"("userId");

-- CreateIndex
CREATE INDEX "ChatNotificationRule_profileId_active_idx" ON "ChatNotificationRule"("profileId", "active");

-- CreateIndex
CREATE INDEX "ChatNotificationRule_scope_value_idx" ON "ChatNotificationRule"("scope", "value");

-- CreateIndex
CREATE INDEX "ChatDndWindow_profileId_active_idx" ON "ChatDndWindow"("profileId", "active");

-- CreateIndex
CREATE INDEX "ChatPinnedItem_profileId_pinned_idx" ON "ChatPinnedItem"("profileId", "pinned");

-- CreateIndex
CREATE UNIQUE INDEX "ChatPinnedItem_profileId_kind_refId_key" ON "ChatPinnedItem"("profileId", "kind", "refId");

-- CreateIndex
CREATE INDEX "ChatWorkspaceDefaultRule_workspaceId_active_idx" ON "ChatWorkspaceDefaultRule"("workspaceId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ChatWorkspaceDefaultRule_workspaceId_scope_value_key" ON "ChatWorkspaceDefaultRule"("workspaceId", "scope", "value");

-- CreateIndex
CREATE INDEX "ChatPreferenceEvent_profileId_createdAt_idx" ON "ChatPreferenceEvent"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatPreferenceEvent_profileId_kind_idx" ON "ChatPreferenceEvent"("profileId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "NeuralProfile_userId_key" ON "NeuralProfile"("userId");

-- CreateIndex
CREATE INDEX "NeuralSharing_userId_active_idx" ON "NeuralSharing"("userId", "active");

-- CreateIndex
CREATE INDEX "NeuralSharing_workspaceId_active_idx" ON "NeuralSharing"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "NeuralCommand_userId_createdAt_idx" ON "NeuralCommand"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NeuralCommand_huddleId_idx" ON "NeuralCommand"("huddleId");

-- CreateIndex
CREATE INDEX "NeuralAccessLog_userId_createdAt_idx" ON "NeuralAccessLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MailThread_workspaceId_folder_latestSentAt_idx" ON "MailThread"("workspaceId", "folder", "latestSentAt" DESC);

-- CreateIndex
CREATE INDEX "MailThread_workspaceId_isRead_unreadCount_idx" ON "MailThread"("workspaceId", "isRead", "unreadCount");

-- CreateIndex
CREATE UNIQUE INDEX "MailThread_workspaceId_threadId_key" ON "MailThread"("workspaceId", "threadId");

-- CreateIndex
CREATE INDEX "MailDraft_workspaceId_updatedAt_idx" ON "MailDraft"("workspaceId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "MailRule_workspaceId_priority_enabled_idx" ON "MailRule"("workspaceId", "priority", "enabled");

-- CreateIndex
CREATE INDEX "MailRule_workspaceId_createdAt_idx" ON "MailRule"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MailAttachment_messageId_idx" ON "MailAttachment"("messageId");

-- CreateIndex
CREATE INDEX "MailDomain_workspaceId_verified_idx" ON "MailDomain"("workspaceId", "verified");

-- CreateIndex
CREATE UNIQUE INDEX "MailDomain_workspaceId_domain_key" ON "MailDomain"("workspaceId", "domain");

-- CreateIndex
CREATE INDEX "DnsRecord_domainId_type_idx" ON "DnsRecord"("domainId", "type");

-- CreateIndex
CREATE INDEX "EmailAlias_workspaceId_isActive_idx" ON "EmailAlias"("workspaceId", "isActive");

-- CreateIndex
CREATE INDEX "EmailAlias_forwardTo_idx" ON "EmailAlias"("forwardTo");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAlias_domainId_localPart_key" ON "EmailAlias"("domainId", "localPart");

-- CreateIndex
CREATE INDEX "ReverseAlias_workspaceId_aliasId_idx" ON "ReverseAlias"("workspaceId", "aliasId");

-- CreateIndex
CREATE UNIQUE INDEX "ReverseAlias_relayAddress_key" ON "ReverseAlias"("relayAddress");

-- CreateIndex
CREATE INDEX "BreachEvent_workspaceId_detectedAt_idx" ON "BreachEvent"("workspaceId", "detectedAt" DESC);

-- CreateIndex
CREATE INDEX "BreachEvent_workspaceId_severity_idx" ON "BreachEvent"("workspaceId", "severity");

-- CreateIndex
CREATE INDEX "MailContact_workspaceId_lastName_firstName_idx" ON "MailContact"("workspaceId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "MailContact_workspaceId_isFavorite_idx" ON "MailContact"("workspaceId", "isFavorite");

-- CreateIndex
CREATE UNIQUE INDEX "MailContact_workspaceId_email_key" ON "MailContact"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "MailSignature_workspaceId_isDefault_idx" ON "MailSignature"("workspaceId", "isDefault");

-- CreateIndex
CREATE INDEX "MailUserFolder_workspaceId_parentFolderId_idx" ON "MailUserFolder"("workspaceId", "parentFolderId");

-- CreateIndex
CREATE UNIQUE INDEX "MailUserFolder_workspaceId_parentFolderId_name_key" ON "MailUserFolder"("workspaceId", "parentFolderId", "name");

-- CreateIndex
CREATE INDEX "MailComment_messageId_createdAt_idx" ON "MailComment"("messageId", "createdAt");

-- CreateIndex
CREATE INDEX "MailComment_workspaceId_authorId_idx" ON "MailComment"("workspaceId", "authorId");

-- CreateIndex
CREATE INDEX "MailDelegation_workspaceId_delegatorId_idx" ON "MailDelegation"("workspaceId", "delegatorId");

-- CreateIndex
CREATE INDEX "MailDelegation_workspaceId_delegateId_idx" ON "MailDelegation"("workspaceId", "delegateId");

-- CreateIndex
CREATE UNIQUE INDEX "MailDelegation_delegatorId_delegateId_key" ON "MailDelegation"("delegatorId", "delegateId");

-- CreateIndex
CREATE INDEX "MailTask_workspaceId_status_priority_idx" ON "MailTask"("workspaceId", "status", "priority");

-- CreateIndex
CREATE INDEX "MailTask_workspaceId_assigneeId_idx" ON "MailTask"("workspaceId", "assigneeId");

-- CreateIndex
CREATE INDEX "MailTask_messageId_idx" ON "MailTask"("messageId");

-- CreateIndex
CREATE INDEX "MailSharedDraft_workspaceId_status_createdAt_idx" ON "MailSharedDraft"("workspaceId", "status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MailSharedDraftCollaborator_sharedDraftId_userId_key" ON "MailSharedDraftCollaborator"("sharedDraftId", "userId");

-- CreateIndex
CREATE INDEX "MailRoutingRule_workspaceId_tier_isActive_idx" ON "MailRoutingRule"("workspaceId", "tier", "isActive");

-- CreateIndex
CREATE INDEX "MailRoutingRule_workspaceId_priority_idx" ON "MailRoutingRule"("workspaceId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "MailInboxSecurity_workspaceId_key" ON "MailInboxSecurity"("workspaceId");

-- CreateIndex
CREATE INDEX "MailSecurityEvent_workspaceId_detectedAt_idx" ON "MailSecurityEvent"("workspaceId", "detectedAt" DESC);

-- CreateIndex
CREATE INDEX "MailSecurityEvent_workspaceId_type_severity_idx" ON "MailSecurityEvent"("workspaceId", "type", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorCircuit_integrationId_key" ON "ConnectorCircuit"("integrationId");

-- CreateIndex
CREATE INDEX "ConnectorCircuit_workspaceId_idx" ON "ConnectorCircuit"("workspaceId");

-- CreateIndex
CREATE INDEX "ConnectorEventLog_workspaceId_direction_status_idx" ON "ConnectorEventLog"("workspaceId", "direction", "status");

-- CreateIndex
CREATE INDEX "ConnectorEventLog_integrationId_createdAt_idx" ON "ConnectorEventLog"("integrationId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorEventLog_idempotencyKey_key" ON "ConnectorEventLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ConnectorSyncCheckpoint_workspaceId_idx" ON "ConnectorSyncCheckpoint"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorSyncCheckpoint_integrationId_objectType_key" ON "ConnectorSyncCheckpoint"("integrationId", "objectType");

-- CreateIndex
CREATE INDEX "AniMemoryMark_workspaceId_userId_type_idx" ON "AniMemoryMark"("workspaceId", "userId", "type");

-- CreateIndex
CREATE INDEX "AniMemoryMark_workspaceId_importance_idx" ON "AniMemoryMark"("workspaceId", "importance" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "AniLearningProgress_workspaceId_userId_moduleId_key" ON "AniLearningProgress"("workspaceId", "userId", "moduleId");

-- CreateIndex
CREATE INDEX "AniOutcome_workspaceId_userId_feature_idx" ON "AniOutcome"("workspaceId", "userId", "feature");

-- CreateIndex
CREATE INDEX "AniOutcome_workspaceId_createdAt_idx" ON "AniOutcome"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AniMeetingSession_workspaceId_createdAt_idx" ON "AniMeetingSession"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AniConsciousnessSnapshot_workspaceId_createdAt_idx" ON "AniConsciousnessSnapshot"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LiveEmbed_channelId_idx" ON "LiveEmbed"("channelId");

-- CreateIndex
CREATE INDEX "LiveEmbed_workspaceId_sourceType_idx" ON "LiveEmbed"("workspaceId", "sourceType");

-- CreateIndex
CREATE INDEX "PresentationSession_workspaceId_idx" ON "PresentationSession"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SubVocalConfig_userId_workspaceId_key" ON "SubVocalConfig"("userId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMonitor_monitorId_key" ON "ConversationMonitor"("monitorId");

-- CreateIndex
CREATE INDEX "ConversationMonitor_workspaceId_status_idx" ON "ConversationMonitor"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ConversationMonitor_scope_createdAt_idx" ON "ConversationMonitor"("scope", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ConversationMonitor_channelId_createdAt_idx" ON "ConversationMonitor"("channelId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ConversationMonitor_threadId_createdAt_idx" ON "ConversationMonitor"("threadId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SentimentRecord_workspaceId_createdAt_idx" ON "SentimentRecord"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SentimentRecord_channelId_createdAt_idx" ON "SentimentRecord"("channelId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SentimentRecord_threadId_createdAt_idx" ON "SentimentRecord"("threadId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SentimentRecord_senderId_createdAt_idx" ON "SentimentRecord"("senderId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SentimentRecord_topic_createdAt_idx" ON "SentimentRecord"("topic", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ToxicityFlag_workspaceId_status_idx" ON "ToxicityFlag"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ToxicityFlag_workspaceId_createdAt_idx" ON "ToxicityFlag"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ToxicityFlag_messageId_idx" ON "ToxicityFlag"("messageId");

-- CreateIndex
CREATE INDEX "ConflictAlert_workspaceId_status_idx" ON "ConflictAlert"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ConflictAlert_channelId_createdAt_idx" ON "ConflictAlert"("channelId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ConflictAlert_threadId_createdAt_idx" ON "ConflictAlert"("threadId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "EngagementSnapshot_workspaceId_scope_createdAt_idx" ON "EngagementSnapshot"("workspaceId", "scope", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "EngagementSnapshot_channelId_createdAt_idx" ON "EngagementSnapshot"("channelId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ConversationInsight_workspaceId_kind_createdAt_idx" ON "ConversationInsight"("workspaceId", "kind", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ConversationInsight_channelId_createdAt_idx" ON "ConversationInsight"("channelId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "FaqEntry_workspaceId_status_idx" ON "FaqEntry"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "FaqEntry_workspaceId_frequency_idx" ON "FaqEntry"("workspaceId", "frequency" DESC);

-- CreateIndex
CREATE INDEX "ExpertProfile_workspaceId_topic_idx" ON "ExpertProfile"("workspaceId", "topic");

-- CreateIndex
CREATE UNIQUE INDEX "ExpertProfile_workspaceId_userId_topic_key" ON "ExpertProfile"("workspaceId", "userId", "topic");

-- CreateIndex
CREATE INDEX "SmartReplySuggestion_workspaceId_messageId_idx" ON "SmartReplySuggestion"("workspaceId", "messageId");

-- CreateIndex
CREATE INDEX "SmartReplySuggestion_workspaceId_status_idx" ON "SmartReplySuggestion"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "AiTierConfig_workspaceId_idx" ON "AiTierConfig"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "AiTierConfig_workspaceId_scope_key" ON "AiTierConfig"("workspaceId", "scope");

-- CreateIndex
CREATE INDEX "ModerationAuditLog_workspaceId_createdAt_idx" ON "ModerationAuditLog"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BotExecution_createdAt_idx" ON "BotExecution"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_pollId_key" ON "ChatMessage"("pollId");

-- CreateIndex
CREATE INDEX "DeliveryRecord_status_createdAt_idx" ON "DeliveryRecord"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FederatedIdentity_workspaceId_idx" ON "FederatedIdentity"("workspaceId");

-- CreateIndex
CREATE INDEX "FederationConnection_remoteDomain_idx" ON "FederationConnection"("remoteDomain");

-- CreateIndex
CREATE INDEX "GuestAccess_guestEmail_idx" ON "GuestAccess"("guestEmail");

-- CreateIndex
CREATE INDEX "HuddleArtifact_workspaceId_artifactType_idx" ON "HuddleArtifact"("workspaceId", "artifactType");

-- CreateIndex
CREATE INDEX "HuddleParticipant_userId_idx" ON "HuddleParticipant"("userId");

-- CreateIndex
CREATE INDEX "HuddleSession_createdById_idx" ON "HuddleSession"("createdById");

-- CreateIndex
-- Legacy partial unique index (created by 20260810082458_n0va1o_connection_fix)
-- collides with the plain unique index the schema expects; drop it first so
-- fresh deployments succeed.
DROP INDEX IF EXISTS "Integration_activeConnectionId_key";
CREATE UNIQUE INDEX "Integration_activeConnectionId_key" ON "Integration"("activeConnectionId");

-- CreateIndex
CREATE INDEX "IntegrationConnection_workspaceId_integrationId_idx" ON "IntegrationConnection"("workspaceId", "integrationId");

-- CreateIndex
CREATE INDEX "IntegrationConnection_expiresAt_idx" ON "IntegrationConnection"("expiresAt");

-- CreateIndex
CREATE INDEX "MailMessage_workspaceId_status_scheduledAt_idx" ON "MailMessage"("workspaceId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "MailMessage_workspaceId_snoozeUntil_idx" ON "MailMessage"("workspaceId", "snoozeUntil");

-- CreateIndex
CREATE INDEX "MailMessage_workspaceId_aiPriority_idx" ON "MailMessage"("workspaceId", "aiPriority");

-- CreateIndex
CREATE INDEX "MailMessage_workspaceId_aiCategory_idx" ON "MailMessage"("workspaceId", "aiCategory");

-- CreateIndex
CREATE INDEX "Mailbox_workspaceId_isActive_idx" ON "Mailbox"("workspaceId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Mailbox_workspaceId_email_key" ON "Mailbox"("workspaceId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "MailboxMember_mailboxId_userId_key" ON "MailboxMember"("mailboxId", "userId");

-- CreateIndex
CREATE INDEX "NotificationEvent_workspaceId_createdAt_idx" ON "NotificationEvent"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SearchIndex_workspaceId_indexedAt_idx" ON "SearchIndex"("workspaceId", "indexedAt" DESC);

-- CreateIndex
CREATE INDEX "StorageFileVersion_itemId_versionNumber_idx" ON "StorageFileVersion"("itemId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StorageFileVersion_itemId_versionNumber_key" ON "StorageFileVersion"("itemId", "versionNumber");

-- CreateIndex
CREATE INDEX "StorageItem_workspaceId_legalHold_idx" ON "StorageItem"("workspaceId", "legalHold");

-- CreateIndex
CREATE INDEX "StorageItem_workspaceId_retentionMode_idx" ON "StorageItem"("workspaceId", "retentionMode");

-- CreateIndex
CREATE INDEX "ThreadExport_workspaceId_idx" ON "ThreadExport"("workspaceId");

-- CreateIndex
CREATE INDEX "ThreadMetadata_rootMessageId_idx" ON "ThreadMetadata"("rootMessageId");

-- CreateIndex
CREATE INDEX "ThreadPin_userId_idx" ON "ThreadPin"("userId");

-- RenameForeignKey
ALTER TABLE "FederatedIdentity" RENAME CONSTRAINT "FederationIdentity_connectionId_fkey" TO "FederatedIdentity_connectionId_fkey";

-- RenameForeignKey
ALTER TABLE "FederatedIdentity" RENAME CONSTRAINT "FederationIdentity_workspaceId_fkey" TO "FederatedIdentity_workspaceId_fkey";

-- AddForeignKey
ALTER TABLE "FileIndex" ADD CONSTRAINT "FileIndex_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileIndex" ADD CONSTRAINT "FileIndex_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StorageItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAccessLog" ADD CONSTRAINT "FileAccessLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileLegalHold" ADD CONSTRAINT "FileLegalHold_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileLink" ADD CONSTRAINT "FileLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileLink" ADD CONSTRAINT "FileLink_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StorageItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_decisionById_fkey" FOREIGN KEY ("decisionById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalPolicyRule" ADD CONSTRAINT "ApprovalPolicyRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalPolicyRule" ADD CONSTRAINT "ApprovalPolicyRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAuditEntry" ADD CONSTRAINT "ApprovalAuditEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAuditEntry" ADD CONSTRAINT "ApprovalAuditEntry_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAuditEntry" ADD CONSTRAINT "ApprovalAuditEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalComment" ADD CONSTRAINT "ApprovalComment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalComment" ADD CONSTRAINT "ApprovalComment_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalComment" ADD CONSTRAINT "ApprovalComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceApprovalConfig" ADD CONSTRAINT "WorkspaceApprovalConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "ChatPoll"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSearchIndex" ADD CONSTRAINT "ChatSearchIndex_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPoll" ADD CONSTRAINT "ChatPoll_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPoll" ADD CONSTRAINT "ChatPoll_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPoll" ADD CONSTRAINT "ChatPoll_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPollVote" ADD CONSTRAINT "ChatPollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "ChatPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPollVote" ADD CONSTRAINT "ChatPollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatDeliveryPolicy" ADD CONSTRAINT "ChatDeliveryPolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageDelivery" ADD CONSTRAINT "ChatMessageDelivery_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageDelivery" ADD CONSTRAINT "ChatMessageDelivery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageDelivery" ADD CONSTRAINT "ChatMessageDelivery_dlqId_fkey" FOREIGN KEY ("dlqId") REFERENCES "ChatDeliveryDLQ"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatDeliveryAttempt" ADD CONSTRAINT "ChatDeliveryAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "ChatMessageDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatDeliveryAttempt" ADD CONSTRAINT "ChatDeliveryAttempt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatBreaker" ADD CONSTRAINT "ChatBreaker_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatQuotaCounter" ADD CONSTRAINT "ChatQuotaCounter_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatDeliveryDLQ" ADD CONSTRAINT "ChatDeliveryDLQ_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPersonalizationProfile" ADD CONSTRAINT "ChatPersonalizationProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatNotificationRule" ADD CONSTRAINT "ChatNotificationRule_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ChatPersonalizationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatDndWindow" ADD CONSTRAINT "ChatDndWindow_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ChatPersonalizationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPinnedItem" ADD CONSTRAINT "ChatPinnedItem_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ChatPersonalizationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPreferenceEvent" ADD CONSTRAINT "ChatPreferenceEvent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ChatPersonalizationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailThread" ADD CONSTRAINT "MailThread_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailDraft" ADD CONSTRAINT "MailDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailDraft" ADD CONSTRAINT "MailDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailRule" ADD CONSTRAINT "MailRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailRule" ADD CONSTRAINT "MailRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailAttachment" ADD CONSTRAINT "MailAttachment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailAttachment" ADD CONSTRAINT "MailAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailDomain" ADD CONSTRAINT "MailDomain_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailDomain" ADD CONSTRAINT "MailDomain_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DnsRecord" ADD CONSTRAINT "DnsRecord_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "MailDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAlias" ADD CONSTRAINT "EmailAlias_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "MailDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAlias" ADD CONSTRAINT "EmailAlias_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAlias" ADD CONSTRAINT "EmailAlias_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReverseAlias" ADD CONSTRAINT "ReverseAlias_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreachEvent" ADD CONSTRAINT "BreachEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailContact" ADD CONSTRAINT "MailContact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailContact" ADD CONSTRAINT "MailContact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailSignature" ADD CONSTRAINT "MailSignature_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailSignature" ADD CONSTRAINT "MailSignature_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailAutoResponder" ADD CONSTRAINT "MailAutoResponder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailAutoResponder" ADD CONSTRAINT "MailAutoResponder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailUserFolder" ADD CONSTRAINT "MailUserFolder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailUserFolder" ADD CONSTRAINT "MailUserFolder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailUserFolder" ADD CONSTRAINT "MailUserFolder_parentFolderId_fkey" FOREIGN KEY ("parentFolderId") REFERENCES "MailUserFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mailbox" ADD CONSTRAINT "Mailbox_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailComment" ADD CONSTRAINT "MailComment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailComment" ADD CONSTRAINT "MailComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailComment" ADD CONSTRAINT "MailComment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailDelegation" ADD CONSTRAINT "MailDelegation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailDelegation" ADD CONSTRAINT "MailDelegation_delegatorId_fkey" FOREIGN KEY ("delegatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailDelegation" ADD CONSTRAINT "MailDelegation_delegateId_fkey" FOREIGN KEY ("delegateId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailTask" ADD CONSTRAINT "MailTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailTask" ADD CONSTRAINT "MailTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailTask" ADD CONSTRAINT "MailTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailTask" ADD CONSTRAINT "MailTask_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailSharedDraft" ADD CONSTRAINT "MailSharedDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailSharedDraft" ADD CONSTRAINT "MailSharedDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailSharedDraftCollaborator" ADD CONSTRAINT "MailSharedDraftCollaborator_sharedDraftId_fkey" FOREIGN KEY ("sharedDraftId") REFERENCES "MailSharedDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailSharedDraftCollaborator" ADD CONSTRAINT "MailSharedDraftCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailRoutingRule" ADD CONSTRAINT "MailRoutingRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailRoutingRule" ADD CONSTRAINT "MailRoutingRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailInboxSecurity" ADD CONSTRAINT "MailInboxSecurity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailSecurityEvent" ADD CONSTRAINT "MailSecurityEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_activeConnectionId_fkey" FOREIGN KEY ("activeConnectionId") REFERENCES "IntegrationConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorCircuit" ADD CONSTRAINT "ConnectorCircuit_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorCircuit" ADD CONSTRAINT "ConnectorCircuit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorEventLog" ADD CONSTRAINT "ConnectorEventLog_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorEventLog" ADD CONSTRAINT "ConnectorEventLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorSyncCheckpoint" ADD CONSTRAINT "ConnectorSyncCheckpoint_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorSyncCheckpoint" ADD CONSTRAINT "ConnectorSyncCheckpoint_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveEmbed" ADD CONSTRAINT "LiveEmbed_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveEmbed" ADD CONSTRAINT "LiveEmbed_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationSession" ADD CONSTRAINT "PresentationSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationSession" ADD CONSTRAINT "PresentationSession_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationSession" ADD CONSTRAINT "PresentationSession_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubVocalConfig" ADD CONSTRAINT "SubVocalConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubVocalConfig" ADD CONSTRAINT "SubVocalConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadDecision" ADD CONSTRAINT "ThreadDecision_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ThreadMetadata"("threadId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadActionItem" ADD CONSTRAINT "ThreadActionItem_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ThreadMetadata"("threadId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadPin" ADD CONSTRAINT "ThreadPin_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ThreadMetadata"("threadId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadBookmark" ADD CONSTRAINT "ThreadBookmark_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ThreadMetadata"("threadId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadExport" ADD CONSTRAINT "ThreadExport_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ThreadMetadata"("threadId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_digestId_fkey" FOREIGN KEY ("digestId") REFERENCES "NotificationDigest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotExecution" ADD CONSTRAINT "BotExecution_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "BotTrigger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HuddleParticipant" ADD CONSTRAINT "HuddleParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMonitor" ADD CONSTRAINT "ConversationMonitor_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMonitor" ADD CONSTRAINT "ConversationMonitor_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMonitor" ADD CONSTRAINT "ConversationMonitor_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentimentRecord" ADD CONSTRAINT "SentimentRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentimentRecord" ADD CONSTRAINT "SentimentRecord_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentimentRecord" ADD CONSTRAINT "SentimentRecord_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToxicityFlag" ADD CONSTRAINT "ToxicityFlag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToxicityFlag" ADD CONSTRAINT "ToxicityFlag_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToxicityFlag" ADD CONSTRAINT "ToxicityFlag_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictAlert" ADD CONSTRAINT "ConflictAlert_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictAlert" ADD CONSTRAINT "ConflictAlert_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementSnapshot" ADD CONSTRAINT "EngagementSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementSnapshot" ADD CONSTRAINT "EngagementSnapshot_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationInsight" ADD CONSTRAINT "ConversationInsight_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationInsight" ADD CONSTRAINT "ConversationInsight_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaqEntry" ADD CONSTRAINT "FaqEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaqEntry" ADD CONSTRAINT "FaqEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertProfile" ADD CONSTRAINT "ExpertProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertProfile" ADD CONSTRAINT "ExpertProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartReplySuggestion" ADD CONSTRAINT "SmartReplySuggestion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartReplySuggestion" ADD CONSTRAINT "SmartReplySuggestion_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartReplySuggestion" ADD CONSTRAINT "SmartReplySuggestion_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiTierConfig" ADD CONSTRAINT "AiTierConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAuditLog" ADD CONSTRAINT "ModerationAuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthSnapshot" ADD CONSTRAINT "HealthSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessIntervention" ADD CONSTRAINT "WellnessIntervention_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentalReading" ADD CONSTRAINT "EnvironmentalReading_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricReading" ADD CONSTRAINT "BiometricReading_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricConsent" ADD CONSTRAINT "BiometricConsent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "BiometricConsent_ws_user_key" RENAME TO "BiometricConsent_workspaceId_userId_key";

-- RenameIndex
ALTER INDEX "BiometricReading_user_idx" RENAME TO "BiometricReading_userId_recordedAt_idx";

-- RenameIndex
ALTER INDEX "BiometricReading_ws_idx" RENAME TO "BiometricReading_workspaceId_recordedAt_idx";

-- RenameIndex
ALTER INDEX "EnvironmentalReading_room_idx" RENAME TO "EnvironmentalReading_workspaceId_roomRef_recordedAt_idx";

-- RenameIndex
ALTER INDEX "FederationIdentity_connectionId_externalUserId_key" RENAME TO "FederatedIdentity_connectionId_externalUserId_key";

-- RenameIndex
ALTER INDEX "HealthSnapshot_created_idx" RENAME TO "HealthSnapshot_workspaceId_createdAt_idx";

-- RenameIndex
ALTER INDEX "HealthSnapshot_scope_idx" RENAME TO "HealthSnapshot_workspaceId_scopeId_windowStart_idx";

-- RenameIndex
ALTER INDEX "MailMessage_legalHold_idx" RENAME TO "MailMessage_workspaceId_legalHold_idx";

-- RenameIndex
ALTER INDEX "MailMessage_mailboxId_idx" RENAME TO "MailMessage_workspaceId_mailboxId_idx";

-- RenameIndex
ALTER INDEX "WellnessIntervention_scope_idx" RENAME TO "WellnessIntervention_workspaceId_scopeId_createdAt_idx";

-- RenameIndex
ALTER INDEX "WellnessIntervention_status_idx" RENAME TO "WellnessIntervention_workspaceId_status_idx";

