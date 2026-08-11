-- Neural BCI: consent, state records, huddles, attention maps, flow events, sub-vocal

-- Enums
DO $$ BEGIN CREATE TYPE "NeuralFeature" AS ENUM ('FLOW_DETECTION', 'SUBVOCAL_DECODING', 'SHARED_ATTENTION', 'NEURAL_STATE_SHARING', 'TEAM_DASHBOARD'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "NeuralRecipient" AS ENUM ('SELF_ONLY', 'TEAM', 'ROLE_BASED', 'WORKSPACE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ConsentDuration" AS ENUM ('ONE_OFF', 'SESSION', 'PERSISTENT'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PrivacyMode" AS ENUM ('LOCAL_ONLY', 'AGGREGATE_ONLY', 'FULL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "NeuralSource" AS ENUM ('WEARABLE', 'IMPLANTED', 'PERIPHERAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "NeuralModality" AS ENUM ('EEG', 'EMG', 'INTRACORTICAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "HuddleStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "StreamEndpointType" AS ENUM ('NEURAL_STATE', 'SUBVOCAL', 'AUDIO', 'VIDEO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ContextType" AS ENUM ('MESSAGE', 'THREAD', 'DOC', 'NOTIFICATION', 'TASK'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "FlowState" AS ENUM ('IDLE', 'FOCUS', 'FLOW', 'CRISIS', 'DISTRACTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "FlowTrigger" AS ENUM ('NEURAL_SIGNAL', 'USER_ACTION', 'CALENDAR', 'SYSTEM', 'TIMEOUT'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- NeuralConsentScope
CREATE TABLE "NeuralConsentScope" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "feature" "NeuralFeature" NOT NULL,
    "recipient" "NeuralRecipient" NOT NULL,
    "duration" "ConsentDuration" NOT NULL,
    "privacyMode" "PrivacyMode" NOT NULL DEFAULT 'LOCAL_ONLY',
    "retentionDays" INTEGER NOT NULL DEFAULT 30,
    "epsilon" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "lastConfirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NeuralConsentScope_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NeuralConsentScope_userId_workspaceId_feature_recipient_key" ON "NeuralConsentScope"("userId", "workspaceId", "feature", "recipient");
CREATE INDEX "NeuralConsentScope_userId_workspaceId_idx" ON "NeuralConsentScope"("userId", "workspaceId");
CREATE INDEX "NeuralConsentScope_userId_feature_idx" ON "NeuralConsentScope"("userId", "feature");
ALTER TABLE "NeuralConsentScope" ADD CONSTRAINT "NeuralConsentScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NeuralConsentScope" ADD CONSTRAINT "NeuralConsentScope_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- NeuralStateRecord
CREATE TABLE "NeuralStateRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "source" "NeuralSource" NOT NULL,
    "modality" "NeuralModality" NOT NULL,
    "samplingRate" INTEGER NOT NULL DEFAULT 250,
    "attention" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cognitiveLoad" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "flowProb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "blinkRate" INTEGER NOT NULL DEFAULT 0,
    "heartRate" INTEGER,
    "embedding" JSONB NOT NULL DEFAULT '{}',
    "provenanceHash" TEXT NOT NULL,
    "consentScopeId" TEXT,
    "localOnly" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NeuralStateRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NeuralStateRecord_userId_createdAt_idx" ON "NeuralStateRecord"("userId", "createdAt" DESC);
CREATE INDEX "NeuralStateRecord_workspaceId_createdAt_idx" ON "NeuralStateRecord"("workspaceId", "createdAt" DESC);
CREATE INDEX "NeuralStateRecord_userId_flowProb_idx" ON "NeuralStateRecord"("userId", "flowProb" DESC);
ALTER TABLE "NeuralStateRecord" ADD CONSTRAINT "NeuralStateRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NeuralStateRecord" ADD CONSTRAINT "NeuralStateRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NeuralStateRecord" ADD CONSTRAINT "NeuralStateRecord_consentScopeId_fkey" FOREIGN KEY ("consentScopeId") REFERENCES "NeuralConsentScope"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- NeuralHuddleSession
CREATE TABLE "NeuralHuddleSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "roomId" TEXT,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subvocalEnabled" BOOLEAN NOT NULL DEFAULT false,
    "neuralStreamEnabled" BOOLEAN NOT NULL DEFAULT false,
    "latencyTargetMs" INTEGER NOT NULL DEFAULT 25,
    "codecProfile" TEXT NOT NULL DEFAULT 'opus_48k_stereo',
    "privacyPolicyId" TEXT NOT NULL DEFAULT 'neural_v1',
    "status" "HuddleStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "eventStreamTopic" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NeuralHuddleSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NeuralHuddleSession_workspaceId_status_idx" ON "NeuralHuddleSession"("workspaceId", "status");
CREATE INDEX "NeuralHuddleSession_createdById_idx" ON "NeuralHuddleSession"("createdById");
ALTER TABLE "NeuralHuddleSession" ADD CONSTRAINT "NeuralHuddleSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NeuralHuddleSession" ADD CONSTRAINT "NeuralHuddleSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NeuralHuddleSession" ADD CONSTRAINT "NeuralHuddleSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "MeetRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- NeuralHuddleParticipant
CREATE TABLE "NeuralHuddleParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'participant',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "neuralStreamOk" BOOLEAN NOT NULL DEFAULT false,
    "subvocalOk" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "NeuralHuddleParticipant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NeuralHuddleParticipant_sessionId_userId_key" ON "NeuralHuddleParticipant"("sessionId", "userId");
CREATE INDEX "NeuralHuddleParticipant_sessionId_idx" ON "NeuralHuddleParticipant"("sessionId");
ALTER TABLE "NeuralHuddleParticipant" ADD CONSTRAINT "NeuralHuddleParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "NeuralHuddleSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NeuralHuddleParticipant" ADD CONSTRAINT "NeuralHuddleParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- NeuralStreamEndpoint
CREATE TABLE "NeuralStreamEndpoint" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpointType" "StreamEndpointType" NOT NULL,
    "endpointUrl" TEXT NOT NULL,
    "ephemeralKey" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NeuralStreamEndpoint_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NeuralStreamEndpoint_sessionId_idx" ON "NeuralStreamEndpoint"("sessionId");
CREATE INDEX "NeuralStreamEndpoint_userId_idx" ON "NeuralStreamEndpoint"("userId");
ALTER TABLE "NeuralStreamEndpoint" ADD CONSTRAINT "NeuralStreamEndpoint_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "NeuralHuddleSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AttentionMap
CREATE TABLE "AttentionMap" (
    "id" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "contextType" "ContextType" NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "tokenPositions" JSONB NOT NULL DEFAULT '[]',
    "modelAttentionWeights" JSONB NOT NULL DEFAULT '[]',
    "neuralAttentionCorr" JSONB NOT NULL DEFAULT '[]',
    "relevanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttentionMap_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AttentionMap_contextId_idx" ON "AttentionMap"("contextId");
CREATE INDEX "AttentionMap_workspaceId_contextType_idx" ON "AttentionMap"("workspaceId", "contextType");
CREATE INDEX "AttentionMap_userId_relevanceScore_idx" ON "AttentionMap"("userId", "relevanceScore" DESC);
ALTER TABLE "AttentionMap" ADD CONSTRAINT "AttentionMap_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttentionMap" ADD CONSTRAINT "AttentionMap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FlowStateEvent
CREATE TABLE "FlowStateEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromState" "FlowState" NOT NULL,
    "toState" "FlowState" NOT NULL,
    "flowProb" DOUBLE PRECISION NOT NULL,
    "trigger" "FlowTrigger" NOT NULL,
    "actionTaken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlowStateEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FlowStateEvent_userId_createdAt_idx" ON "FlowStateEvent"("userId", "createdAt" DESC);
CREATE INDEX "FlowStateEvent_workspaceId_toState_idx" ON "FlowStateEvent"("workspaceId", "toState");
ALTER TABLE "FlowStateEvent" ADD CONSTRAINT "FlowStateEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlowStateEvent" ADD CONSTRAINT "FlowStateEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SubVocalCommand
CREATE TABLE "SubVocalCommand" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sessionId" TEXT,
    "rawText" TEXT NOT NULL,
    "command" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubVocalCommand_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SubVocalCommand_userId_createdAt_idx" ON "SubVocalCommand"("userId", "createdAt" DESC);
CREATE INDEX "SubVocalCommand_sessionId_idx" ON "SubVocalCommand"("sessionId");
ALTER TABLE "SubVocalCommand" ADD CONSTRAINT "SubVocalCommand_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubVocalCommand" ADD CONSTRAINT "SubVocalCommand_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
