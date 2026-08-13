-- N0VA WELL-BEING OBSERVATORY: unified health snapshots, interventions, environment & biometric ingestion.
CREATE TYPE "WellbeingScope" AS ENUM ('ROOM', 'TEAM', 'WORKSPACE');
CREATE TYPE "InterventionKind" AS ENUM ('BREAK_HUDDLE', 'FOCUS_MODE', 'MODERATION_REVIEW', 'WORKLOAD_REBALANCE', 'MANAGER_CHECKIN', 'ENVIRONMENT_ALERT', 'REST_SUGGESTION', 'CELEBRATE_WINS');
CREATE TYPE "InterventionStatus" AS ENUM ('SUGGESTED', 'ACKNOWLEDGED', 'DISMISSED', 'SNOOZED', 'APPLIED');
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'CRITICAL');

CREATE TABLE "HealthSnapshot" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "scope" "WellbeingScope" NOT NULL,
  "scopeId" TEXT NOT NULL,
  "scopeLabel" TEXT,
  "windowHours" INTEGER NOT NULL DEFAULT 24,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "windowEnd" TIMESTAMP(3) NOT NULL,
  "sentimentScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sentimentTrend" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sentimentConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sentimentSampleSize" INTEGER NOT NULL DEFAULT 0,
  "toxicityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "toxicityTrend" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "toxicityConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "toxicitySampleSize" INTEGER NOT NULL DEFAULT 0,
  "engagementScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "engagementDetails" JSONB,
  "burnoutRisk" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "burnoutComponents" JSONB,
  "cultureAlignment" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cultureComponents" JSONB,
  "environmentComfort" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "environmentDetails" JSONB,
  "roomHealthScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "teamStressScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
  "contributingFactors" JSONB,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HealthSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HealthSnapshot_scope_idx" ON "HealthSnapshot"("workspaceId", "scopeId", "windowStart" DESC);
CREATE INDEX "HealthSnapshot_created_idx" ON "HealthSnapshot"("workspaceId", "createdAt" DESC);

CREATE TABLE "WellnessIntervention" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "scope" "WellbeingScope" NOT NULL DEFAULT 'WORKSPACE',
  "scopeId" TEXT NOT NULL DEFAULT 'workspace',
  "kind" "InterventionKind" NOT NULL,
  "severity" "RiskLevel" NOT NULL DEFAULT 'MODERATE',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "actions" JSONB,
  "status" "InterventionStatus" NOT NULL DEFAULT 'SUGGESTED',
  "snoozedUntil" TIMESTAMP(3),
  "dismissedBy" TEXT,
  "dismissedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WellnessIntervention_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WellnessIntervention_status_idx" ON "WellnessIntervention"("workspaceId", "status");
CREATE INDEX "WellnessIntervention_scope_idx" ON "WellnessIntervention"("workspaceId", "scopeId", "createdAt" DESC);

CREATE TABLE "EnvironmentalReading" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "roomRef" TEXT NOT NULL,
  "co2" INTEGER,
  "voc" INTEGER,
  "pm25" DOUBLE PRECISION,
  "temperatureC" DOUBLE PRECISION,
  "humidity" DOUBLE PRECISION,
  "lightLux" DOUBLE PRECISION,
  "noiseDb" DOUBLE PRECISION,
  "occupancy" INTEGER,
  "source" TEXT NOT NULL DEFAULT 'sensor',
  "recordedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EnvironmentalReading_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EnvironmentalReading_room_idx" ON "EnvironmentalReading"("workspaceId", "roomRef", "recordedAt" DESC);

CREATE TABLE "BiometricReading" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "signals" JSONB NOT NULL DEFAULT '{}',
  "source" TEXT NOT NULL DEFAULT 'device',
  "recordedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BiometricReading_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BiometricReading_ws_idx" ON "BiometricReading"("workspaceId", "recordedAt" DESC);
CREATE INDEX "BiometricReading_user_idx" ON "BiometricReading"("userId", "recordedAt" DESC);

CREATE TABLE "BiometricConsent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "granted" BOOLEAN NOT NULL DEFAULT false,
  "signals" TEXT[] NOT NULL DEFAULT '{}',
  "sharedWith" TEXT[] NOT NULL DEFAULT '{}',
  "optOutAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BiometricConsent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BiometricConsent_ws_user_key" ON "BiometricConsent"("workspaceId", "userId");
