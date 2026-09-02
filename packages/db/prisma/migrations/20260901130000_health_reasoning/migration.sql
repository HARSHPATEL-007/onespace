-- Multimodal Personal Health Reasoning — coordinated fabric, not one general-purpose model. FHIR Clinical Reasoning + CDS Hooks

-- CreateTable
CREATE TABLE "HealthEvidenceSource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "publicationTitle" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "publicationDate" TIMESTAMP(3),
    "reviewDate" TIMESTAMP(3),
    "jurisdiction" TEXT,
    "population" TEXT,
    "clinicalTopic" TEXT,
    "recommendationStrength" TEXT,
    "evidenceQuality" TEXT,
    "conflictsOfInterest" TEXT,
    "applicability" TEXT,
    "expiration" TIMESTAMP(3),
    "license" TEXT,
    "retrievalTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceUrl" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthEvidenceSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthReasoningSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT,
    "encounterId" TEXT,
    "question" TEXT NOT NULL,
    "scope" JSONB NOT NULL DEFAULT '{}',
    "purpose" TEXT NOT NULL DEFAULT 'health_education',
    "consentRef" TEXT,
    "requesterRole" TEXT NOT NULL DEFAULT 'patient',
    "requesterIdentity" TEXT,
    "responsePreferences" JSONB NOT NULL DEFAULT '{}',
    "patientContext" JSONB NOT NULL DEFAULT '{}',
    "stageIntent" TEXT,
    "stageRetrieval" JSONB NOT NULL DEFAULT '{}',
    "stageNormalization" JSONB NOT NULL DEFAULT '{}',
    "stageBaseline" JSONB NOT NULL DEFAULT '{}',
    "stageChanges" JSONB NOT NULL DEFAULT '{}',
    "stageContradictions" JSONB NOT NULL DEFAULT '[]',
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "fusion" JSONB NOT NULL DEFAULT '{}',
    "knownFacts" JSONB NOT NULL DEFAULT '[]',
    "modelObservations" JSONB NOT NULL DEFAULT '[]',
    "possibleExplanations" JSONB NOT NULL DEFAULT '[]',
    "recommendedNextSteps" JSONB NOT NULL DEFAULT '[]',
    "informationNeeded" JSONB NOT NULL DEFAULT '[]',
    "urgentHumanCare" JSONB NOT NULL DEFAULT '[]',
    "contradictions" JSONB NOT NULL DEFAULT '[]',
    "provenanceRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "humanReview" JSONB NOT NULL DEFAULT '{}',
    "limitations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "modelChain" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'safe_to_present',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthReasoningSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HealthEvidenceSource_workspaceId_idx" ON "HealthEvidenceSource"("workspaceId");
CREATE INDEX "HealthEvidenceSource_clinicalTopic_idx" ON "HealthEvidenceSource"("clinicalTopic");

-- CreateIndex
CREATE INDEX "HealthReasoningSession_workspaceId_patientId_idx" ON "HealthReasoningSession"("workspaceId", "patientId");
CREATE INDEX "HealthReasoningSession_status_idx" ON "HealthReasoningSession"("status");
CREATE INDEX "HealthReasoningSession_createdAt_idx" ON "HealthReasoningSession"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "HealthEvidenceSource" ADD CONSTRAINT "HealthEvidenceSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthReasoningSession" ADD CONSTRAINT "HealthReasoningSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthReasoningSession" ADD CONSTRAINT "HealthReasoningSession_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
