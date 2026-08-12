-- Huddle Media System

DO $$ BEGIN CREATE TYPE "HuddleMode" AS ENUM ('INSTANT','SCHEDULED','PERSISTENT','BREAKOUT'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "HuddleSessionStatus" AS ENUM ('SCHEDULED','LIVE','ENDED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "QualityProfile" AS ENUM ('STANDARD','PREMIUM','WEBINAR'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "RecordingType" AS ENUM ('COMPOSITE','RAW_TRACKS','AUDIO_ONLY'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "RecordingStatus" AS ENUM ('RECORDING','PROCESSING','READY','FAILED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "HuddleRole" AS ENUM ('HOST','PRESENTER','SPEAKER','ATTENDEE','GUEST'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "NetworkQuality" AS ENUM ('POOR','FAIR','GOOD','EXCELLENT'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AssignmentType" AS ENUM ('MANUAL','AUTO_ROLE','AUTO_TEAM'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "BreakoutStatus" AS ENUM ('ACTIVE','ENDED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "TrackType" AS ENUM ('AUDIO','VIDEO','SCREEN_SHARE','COMPOSITE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "HuddleArtifactType" AS ENUM ('TRANSCRIPT','SUMMARY','DECISIONS','ACTION_ITEMS','CHAT_LOG','RECORDING'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE "HuddleSession" (
    "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "channelId" TEXT, "createdById" TEXT NOT NULL, "title" TEXT NOT NULL,
    "mode" "HuddleMode" NOT NULL DEFAULT 'INSTANT', "status" "HuddleSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "qualityProfile" "QualityProfile" NOT NULL DEFAULT 'PREMIUM', "presenterVideo" TEXT NOT NULL DEFAULT '4k60',
    "participantVideo" TEXT NOT NULL DEFAULT '720p30', "audioCodec" TEXT NOT NULL DEFAULT 'opus_48khz_stereo',
    "maxParticipants" INTEGER NOT NULL DEFAULT 100, "guestPolicy" JSONB NOT NULL DEFAULT '{}',
    "recordingEnabled" BOOLEAN NOT NULL DEFAULT false, "recordingType" "RecordingType" NOT NULL DEFAULT 'COMPOSITE',
    "retentionDays" INTEGER NOT NULL DEFAULT 90, "consentRequired" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3), "endedAt" TIMESTAMP(3), "scheduledFor" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HuddleSession_pkey" PRIMARY KEY ("id"));
CREATE INDEX "HuddleSession_workspaceId_status_idx" ON "HuddleSession"("workspaceId", "status");
ALTER TABLE "HuddleSession" ADD CONSTRAINT "HuddleSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HuddleSession" ADD CONSTRAINT "HuddleSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "HuddleParticipant" (
    "id" TEXT NOT NULL, "huddleId" TEXT NOT NULL, "userId" TEXT, "displayName" TEXT NOT NULL, "role" "HuddleRole" NOT NULL DEFAULT 'ATTENDEE',
    "guestToken" TEXT, "guestOrg" TEXT, "audioEnabled" BOOLEAN NOT NULL DEFAULT true, "videoEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isPresenter" BOOLEAN NOT NULL DEFAULT false, "isSpeaking" BOOLEAN NOT NULL DEFAULT false, "handRaised" BOOLEAN NOT NULL DEFAULT false,
    "networkQuality" "NetworkQuality" NOT NULL DEFAULT 'GOOD', "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leftAt" TIMESTAMP(3),
    CONSTRAINT "HuddleParticipant_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "HuddleParticipant_guestToken_key" ON "HuddleParticipant"("guestToken");
CREATE INDEX "HuddleParticipant_huddleId_idx" ON "HuddleParticipant"("huddleId");
ALTER TABLE "HuddleParticipant" ADD CONSTRAINT "HuddleParticipant_huddleId_fkey" FOREIGN KEY ("huddleId") REFERENCES "HuddleSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "HuddleRecording" (
    "id" TEXT NOT NULL, "huddleId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "startedById" TEXT NOT NULL, "recordingType" "RecordingType" NOT NULL DEFAULT 'COMPOSITE',
    "status" "RecordingStatus" NOT NULL DEFAULT 'RECORDING', "storageKey" TEXT, "durationSec" INTEGER NOT NULL DEFAULT 0,
    "fileSizeBytes" INTEGER NOT NULL DEFAULT 0, "trackCount" INTEGER NOT NULL DEFAULT 0, "transcriptKey" TEXT,
    "startedAt" TIMESTAMP(3), "endedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HuddleRecording_pkey" PRIMARY KEY ("id"));
CREATE INDEX "HuddleRecording_huddleId_idx" ON "HuddleRecording"("huddleId");
ALTER TABLE "HuddleRecording" ADD CONSTRAINT "HuddleRecording_huddleId_fkey" FOREIGN KEY ("huddleId") REFERENCES "HuddleSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HuddleRecording" ADD CONSTRAINT "HuddleRecording_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HuddleRecording" ADD CONSTRAINT "HuddleRecording_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RecordingTrack" (
    "id" TEXT NOT NULL, "recordingId" TEXT NOT NULL, "participantId" TEXT, "participantName" TEXT, "trackType" "TrackType" NOT NULL,
    "storageKey" TEXT NOT NULL, "durationSec" INTEGER NOT NULL DEFAULT 0, "fileSizeBytes" INTEGER NOT NULL DEFAULT 0,
    "isRedacted" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecordingTrack_pkey" PRIMARY KEY ("id"));
CREATE INDEX "RecordingTrack_recordingId_idx" ON "RecordingTrack"("recordingId");
ALTER TABLE "RecordingTrack" ADD CONSTRAINT "RecordingTrack_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "HuddleRecording"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BreakoutRoom" (
    "id" TEXT NOT NULL, "parentHuddleId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "createdById" TEXT NOT NULL, "title" TEXT NOT NULL,
    "assignmentType" "AssignmentType" NOT NULL DEFAULT 'MANUAL', "durationMin" INTEGER, "status" "BreakoutStatus" NOT NULL DEFAULT 'ACTIVE',
    "broadcastFromHost" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "endedAt" TIMESTAMP(3),
    CONSTRAINT "BreakoutRoom_pkey" PRIMARY KEY ("id"));
CREATE INDEX "BreakoutRoom_parentHuddleId_idx" ON "BreakoutRoom"("parentHuddleId");
ALTER TABLE "BreakoutRoom" ADD CONSTRAINT "BreakoutRoom_parentHuddleId_fkey" FOREIGN KEY ("parentHuddleId") REFERENCES "HuddleSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BreakoutRoom" ADD CONSTRAINT "BreakoutRoom_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BreakoutRoom" ADD CONSTRAINT "BreakoutRoom_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BreakoutParticipant" (
    "id" TEXT NOT NULL, "breakoutId" TEXT NOT NULL, "userId" TEXT, "displayName" TEXT NOT NULL, "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BreakoutParticipant_pkey" PRIMARY KEY ("id"));
CREATE INDEX "BreakoutParticipant_breakoutId_idx" ON "BreakoutParticipant"("breakoutId");
ALTER TABLE "BreakoutParticipant" ADD CONSTRAINT "BreakoutParticipant_breakoutId_fkey" FOREIGN KEY ("breakoutId") REFERENCES "BreakoutRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "HuddleArtifact" (
    "id" TEXT NOT NULL, "huddleId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "artifactType" "HuddleArtifactType" NOT NULL,
    "title" TEXT NOT NULL, "content" TEXT NOT NULL DEFAULT '', "storageKey" TEXT, "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "HuddleArtifact_pkey" PRIMARY KEY ("id"));
CREATE INDEX "HuddleArtifact_huddleId_idx" ON "HuddleArtifact"("huddleId");
ALTER TABLE "HuddleArtifact" ADD CONSTRAINT "HuddleArtifact_huddleId_fkey" FOREIGN KEY ("huddleId") REFERENCES "HuddleSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HuddleArtifact" ADD CONSTRAINT "HuddleArtifact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
