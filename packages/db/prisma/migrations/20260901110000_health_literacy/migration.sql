-- Adaptive Communication and Health Literacy Layer — universal-precautions, AHRQ teach-back, 5 reading levels, 3 language layers, 4 modes, WCAG 2.2 AA
-- Never adapt truth/safety/uncertainty. Never change dose, remove contraindication, upgrade uncertainty, omit emergency, convert conditional to universal, translate without meaning, present AI as clinician, infer cultural without consent.

-- CreateEnum
CREATE TYPE "ReadingLevel" AS ENUM ('ESSENTIAL', 'PLAIN', 'DETAILED', 'CLINICAL', 'RESEARCH');

-- CreateEnum
CREATE TYPE "CommunicationRole" AS ENUM ('PATIENT', 'CAREGIVER', 'CLINICIAN', 'RESEARCHER');

-- CreateEnum
CREATE TYPE "TeachBackMethod" AS ENUM ('VOICE_OR_TEXT', 'SHOW_ME');

-- CreateEnum
CREATE TYPE "TeachBackResult" AS ENUM ('CORRECT', 'PARTIAL', 'UNSAFE', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "AmbiguityRiskTier" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'EMERGENCY', 'UNRESOLVABLE');

-- CreateTable
CREATE TABLE "HealthCommunicationProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "patientId" TEXT,
    "role" "CommunicationRole" NOT NULL DEFAULT 'PATIENT',
    "preferredLanguage" TEXT NOT NULL DEFAULT 'gu-IN',
    "fallbackLanguages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "readingLevel" "ReadingLevel" NOT NULL DEFAULT 'PLAIN',
    "preferredModalities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accessibility" JSONB NOT NULL DEFAULT '{}',
    "culturalPreferences" JSONB NOT NULL DEFAULT '{}',
    "teachBack" JSONB NOT NULL DEFAULT '{}',
    "technicalDetail" TEXT NOT NULL DEFAULT 'on_demand',
    "consentScope" TEXT NOT NULL DEFAULT 'patient_communication',
    "safeMemory" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCommunicationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthTeachBackRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT,
    "userId" TEXT,
    "teachBackId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "instructionVersion" TEXT NOT NULL,
    "method" "TeachBackMethod" NOT NULL DEFAULT 'VOICE_OR_TEXT',
    "result" "TeachBackResult" NOT NULL DEFAULT 'CORRECT',
    "misunderstoodElement" TEXT,
    "reExplanationMethod" TEXT,
    "secondAttempt" TEXT,
    "escalation" TEXT,
    "patientPreferenceUpdated" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthTeachBackRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthClarificationSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT,
    "userId" TEXT,
    "riskLevel" "AmbiguityRiskTier" NOT NULL DEFAULT 'LOW',
    "clarificationRequired" BOOLEAN NOT NULL DEFAULT false,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "emergencyScreen" JSONB,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthClarificationSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthCommunicationProfile_workspaceId_userId_key" ON "HealthCommunicationProfile"("workspaceId", "userId");
CREATE INDEX "HealthCommunicationProfile_workspaceId_idx" ON "HealthCommunicationProfile"("workspaceId");
CREATE INDEX "HealthCommunicationProfile_patientId_idx" ON "HealthCommunicationProfile"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthTeachBackRecord_teachBackId_key" ON "HealthTeachBackRecord"("teachBackId");
CREATE INDEX "HealthTeachBackRecord_workspaceId_patientId_idx" ON "HealthTeachBackRecord"("workspaceId", "patientId");
CREATE INDEX "HealthTeachBackRecord_topic_idx" ON "HealthTeachBackRecord"("topic");

-- CreateIndex
CREATE INDEX "HealthClarificationSession_workspaceId_patientId_idx" ON "HealthClarificationSession"("workspaceId", "patientId");
CREATE INDEX "HealthClarificationSession_riskLevel_idx" ON "HealthClarificationSession"("riskLevel");

-- AddForeignKey
ALTER TABLE "HealthCommunicationProfile" ADD CONSTRAINT "HealthCommunicationProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthCommunicationProfile" ADD CONSTRAINT "HealthCommunicationProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthCommunicationProfile" ADD CONSTRAINT "HealthCommunicationProfile_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthTeachBackRecord" ADD CONSTRAINT "HealthTeachBackRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthTeachBackRecord" ADD CONSTRAINT "HealthTeachBackRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthTeachBackRecord" ADD CONSTRAINT "HealthTeachBackRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthClarificationSession" ADD CONSTRAINT "HealthClarificationSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthClarificationSession" ADD CONSTRAINT "HealthClarificationSession_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthClarificationSession" ADD CONSTRAINT "HealthClarificationSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
