-- N0VA VOICE (Project Echo) round 2: timezone, priority, attendees, quality tracking.
ALTER TABLE "VoiceRecording" ADD COLUMN "timezone" TEXT;

ALTER TABLE "VoiceExtraction" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "VoiceExtraction" ADD COLUMN "attendees" JSONB;

CREATE INDEX "VoiceExtraction_priority_idx" ON "VoiceExtraction"("priority");
