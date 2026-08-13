-- N0VA VOICE (Project Echo): transcribed, searchable, executable audio layer.
CREATE TYPE "VoiceSource" AS ENUM ('NOTE', 'MEMO', 'HUDDLE', 'UPLOAD', 'LIVE');
CREATE TYPE "VoiceStatus" AS ENUM ('RECORDING', 'PENDING', 'TRANSCRIBING', 'EXTRACTED', 'DONE', 'FAILED');
CREATE TYPE "VoiceConsent" AS ENUM ('NONE', 'INFORMED', 'GUEST_DISCLOSED', 'ON_DEVICE');
CREATE TYPE "VoiceExtractionKind" AS ENUM ('TASK', 'FOLLOW_UP', 'REMINDER', 'DECISION', 'APPROVAL', 'DELEGATE', 'RESEARCH', 'EVENT');
CREATE TYPE "VoiceExtractionState" AS ENUM ('DRAFT', 'CONFIRMED', 'REJECTED', 'AUTO_CREATED');

CREATE TABLE "VoiceRecording" (
  "id" TEXT NOT NULL,
  "voiceId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "source" "VoiceSource" NOT NULL DEFAULT 'NOTE',
  "status" "VoiceStatus" NOT NULL DEFAULT 'PENDING',
  "title" TEXT NOT NULL DEFAULT '',
  "audioKey" TEXT NOT NULL DEFAULT '',
  "audioSizeBytes" INTEGER NOT NULL DEFAULT 0,
  "audioDurationMs" INTEGER NOT NULL DEFAULT 0,
  "mimeType" TEXT NOT NULL DEFAULT 'audio/webm',
  "language" TEXT NOT NULL DEFAULT 'en',
  "consent" "VoiceConsent" NOT NULL DEFAULT 'INFORMED',
  "retentionDays" INTEGER NOT NULL DEFAULT 90,
  "roomRef" TEXT,
  "threadRef" TEXT,
  "transcriptText" TEXT NOT NULL DEFAULT '',
  "correctedTranscript" TEXT,
  "transcriptVersion" INTEGER NOT NULL DEFAULT 1,
  "confidenceAvg" DOUBLE PRECISION,
  "qualityStats" JSONB,
  "summary" JSONB,
  "meta" JSONB,
  "transcribedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "VoiceRecording_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VoiceRecording_voiceId_key" ON "VoiceRecording"("voiceId");

CREATE TABLE "VoiceTranscriptSegment" (
  "id" TEXT NOT NULL,
  "recordingId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "startMs" INTEGER NOT NULL,
  "endMs" INTEGER NOT NULL,
  "speaker" TEXT NOT NULL DEFAULT 'SPEAKER_00',
  "text" TEXT NOT NULL,
  "correctedText" TEXT,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,

  CONSTRAINT "VoiceTranscriptSegment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VoiceExtraction" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "recordingId" TEXT NOT NULL,
  "kind" "VoiceExtractionKind" NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "ownerId" TEXT,
  "assigneeName" TEXT,
  "dueAt" TIMESTAMP(3),
  "startAt" TIMESTAMP(3),
  "endAt" TIMESTAMP(3),
  "durationMin" INTEGER,
  "confidence" DOUBLE PRECISION NOT NULL,
  "sourceStartMs" INTEGER NOT NULL,
  "sourceEndMs" INTEGER NOT NULL,
  "sourceText" TEXT NOT NULL,
  "state" "VoiceExtractionState" NOT NULL DEFAULT 'DRAFT',
  "targetType" TEXT,
  "targetId" TEXT,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),

  CONSTRAINT "VoiceExtraction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoiceRecording_workspaceId_createdAt_idx" ON "VoiceRecording"("workspaceId", "createdAt" DESC);
CREATE INDEX "VoiceRecording_status_idx" ON "VoiceRecording"("status");
CREATE INDEX "VoiceRecording_source_idx" ON "VoiceRecording"("source");
CREATE INDEX "VoiceRecording_roomRef_idx" ON "VoiceRecording"("roomRef");
CREATE INDEX "VoiceTranscriptSegment_recordingId_order_idx" ON "VoiceTranscriptSegment"("recordingId", "order");
CREATE INDEX "VoiceExtraction_recordingId_idx" ON "VoiceExtraction"("recordingId");
CREATE INDEX "VoiceExtraction_state_idx" ON "VoiceExtraction"("state");
CREATE INDEX "VoiceExtraction_workspaceId_idx" ON "VoiceExtraction"("workspaceId");

ALTER TABLE "VoiceTranscriptSegment" ADD CONSTRAINT "VoiceTranscriptSegment_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "VoiceRecording"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceExtraction" ADD CONSTRAINT "VoiceExtraction_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "VoiceRecording"("id") ON DELETE CASCADE ON UPDATE CASCADE;