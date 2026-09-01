-- HDPTF — Health Data Provenance and Trust Fabric
-- HL7 FHIR Provenance + W3C PROV + FDA time-stamped audit trail

-- CreateEnum
CREATE TYPE "ProvenanceOrigin" AS ENUM ('PATIENT_REPORTED', 'CAREGIVER_REPORTED', 'CLINICIAN_ENTERED', 'DEVICE_GENERATED', 'LABORATORY_GENERATED', 'IMPORTED', 'TRANSFORMED', 'INFERRED', 'SYNTHETIC', 'HUMAN_ADJUDICATED');

-- CreateEnum
CREATE TYPE "TrustLabel" AS ENUM ('MEASURED', 'REPORTED', 'IMPORTED', 'VALIDATED', 'DERIVED', 'INFERRED', 'UNVERIFIED', 'STALE', 'CONFLICTED', 'SYNTHETIC', 'CORRECTED');

-- CreateEnum
CREATE TYPE "ProvenanceEventType" AS ENUM ('OBSERVATION_RECEIVED', 'OBSERVATION_VALIDATED', 'OBSERVATION_NORMALIZED', 'OBSERVATION_CORRECTED', 'INFERENCE_GENERATED', 'INFERENCE_REVIEWED', 'ACTION_APPROVED', 'ACTION_EXECUTED', 'OUTCOME_RECORDED');

-- CreateEnum
CREATE TYPE "SignatureClass" AS ENUM ('HUMAN_CLINICAL', 'SYSTEM', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "RetentionClass" AS ENUM ('P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7');

-- CreateTable
CREATE TABLE "HealthDeviceTrustProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "deviceId" TEXT,
    "manufacturer" TEXT NOT NULL,
    "deviceModel" TEXT NOT NULL,
    "serialOrAttestation" TEXT,
    "firmware" TEXT,
    "hardwareRevision" TEXT,
    "regulatoryStatus" TEXT,
    "intendedUse" TEXT,
    "supportedMeasurements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "calibrationRequirements" TEXT,
    "expectedRanges" JSONB NOT NULL DEFAULT '{}',
    "samplingBehavior" TEXT,
    "knownLimitations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "securityStatus" TEXT,
    "lastMaintenance" TIMESTAMP(3),
    "lastCalibration" TIMESTAMP(3),
    "signalQualityAlgorithm" TEXT,
    "dataTransferMethod" TEXT,
    "timeSyncMethod" TEXT,
    "revocationStatus" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthDeviceTrustProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthProvenanceRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT,
    "encounterId" TEXT,
    "targetResourceType" TEXT NOT NULL,
    "targetResourceId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "agentId" TEXT,
    "fhirProvenance" JSONB,
    "w3cProv" JSONB,
    "parentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "childIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "origin" "ProvenanceOrigin" NOT NULL DEFAULT 'DEVICE_GENERATED',
    "trustLabel" "TrustLabel" NOT NULL DEFAULT 'MEASURED',
    "retentionClass" "RetentionClass" NOT NULL DEFAULT 'P2',
    "fhirTargetReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthProvenanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthObservationTrust" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "observationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "origin" "ProvenanceOrigin" NOT NULL DEFAULT 'DEVICE_GENERATED',
    "source" JSONB NOT NULL DEFAULT '{}',
    "timing" JSONB NOT NULL DEFAULT '{}',
    "quality" JSONB NOT NULL DEFAULT '{}',
    "calibration" JSONB NOT NULL DEFAULT '{}',
    "transformation" JSONB NOT NULL DEFAULT '{}',
    "provenanceRef" TEXT,
    "contentHash" TEXT,
    "trustLabel" "TrustLabel" NOT NULL DEFAULT 'MEASURED',
    "retentionClass" "RetentionClass" NOT NULL DEFAULT 'P2',
    "fhirObservation" JSONB,
    "fhirProvenanceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthObservationTrust_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthInferenceTrust" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT,
    "encounterId" TEXT,
    "inferenceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'review_required',
    "modelFamily" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "artifactDigest" TEXT,
    "promptVersion" TEXT,
    "retrievalIndexVersion" TEXT,
    "sourceDocuments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "featureSnapshot" JSONB NOT NULL DEFAULT '{}',
    "inputTimestamp" TIMESTAMP(3),
    "modelTimestamp" TIMESTAMP(3),
    "confidence" DOUBLE PRECISION,
    "calibrationStatus" TEXT,
    "uncertainty" JSONB NOT NULL DEFAULT '{}',
    "abstentionChecks" JSONB NOT NULL DEFAULT '{}',
    "policyEngineVersion" TEXT,
    "applicableGuideline" TEXT,
    "contraindicationsConsidered" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "humanReviewRequirement" TEXT,
    "outputExpiration" TIMESTAMP(3),
    "inputs" JSONB NOT NULL DEFAULT '[]',
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "validUntil" TIMESTAMP(3),
    "requiresHumanReview" BOOLEAN NOT NULL DEFAULT true,
    "signature" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthInferenceTrust_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthActionTrust" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT,
    "encounterId" TEXT,
    "actionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "trigger" JSONB NOT NULL DEFAULT '{}',
    "authorization" JSONB NOT NULL DEFAULT '{}',
    "execution" JSONB NOT NULL DEFAULT '{}',
    "outcomeRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthActionTrust_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthOutcomeTrust" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT,
    "encounterId" TEXT,
    "outcomeId" TEXT NOT NULL,
    "actionId" TEXT,
    "followUpMeasurement" JSONB,
    "clinicalOutcome" TEXT,
    "patientReportedOutcome" TEXT,
    "adverseEvent" TEXT,
    "override" TEXT,
    "reassessment" TEXT,
    "readmission" BOOLEAN,
    "escalation" TEXT,
    "resolution" TEXT,
    "unresolvedStatus" TEXT,
    "outcomeAdjudicator" TEXT,
    "outcomeTimestamp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthOutcomeTrust_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthProvenanceEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT,
    "encounterId" TEXT,
    "eventId" TEXT NOT NULL,
    "eventType" "ProvenanceEventType" NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousStateHash" TEXT,
    "currentPayloadHash" TEXT,
    "parentEventId" TEXT,
    "softwareVersion" TEXT,
    "policyVersion" TEXT,
    "signature" JSONB,
    "reasonCode" TEXT,
    "correlationId" TEXT,
    "retentionClass" "RetentionClass" NOT NULL DEFAULT 'P2',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthProvenanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCorrectionTrust" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT,
    "recordId" TEXT NOT NULL,
    "originalValue" JSONB NOT NULL,
    "proposedValue" JSONB NOT NULL,
    "reason" TEXT,
    "evidence" JSONB,
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
    "responsibleOrg" TEXT,
    "correctedValue" JSONB,
    "effectiveDate" TIMESTAMP(3),
    "superseded" BOOLEAN NOT NULL DEFAULT false,
    "dependentArtifacts" JSONB NOT NULL DEFAULT '[]',
    "notifiedRecipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "patientMessage" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCorrectionTrust_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthDeviceTrustProfile_workspaceId_manufacturer_deviceModel_firmware_version_key" ON "HealthDeviceTrustProfile"("workspaceId", "manufacturer", "deviceModel", "firmware", "version");
CREATE INDEX "HealthDeviceTrustProfile_workspaceId_deviceId_idx" ON "HealthDeviceTrustProfile"("workspaceId", "deviceId");

-- CreateIndex
CREATE INDEX "HealthProvenanceRecord_workspaceId_targetResourceType_targetResourceId_idx" ON "HealthProvenanceRecord"("workspaceId", "targetResourceType", "targetResourceId");
CREATE INDEX "HealthProvenanceRecord_workspaceId_patientId_idx" ON "HealthProvenanceRecord"("workspaceId", "patientId");
CREATE INDEX "HealthProvenanceRecord_origin_idx" ON "HealthProvenanceRecord"("origin");
CREATE INDEX "HealthProvenanceRecord_trustLabel_idx" ON "HealthProvenanceRecord"("trustLabel");

-- CreateIndex
CREATE UNIQUE INDEX "HealthObservationTrust_observationId_key" ON "HealthObservationTrust"("observationId");
CREATE INDEX "HealthObservationTrust_workspaceId_patientId_idx" ON "HealthObservationTrust"("workspaceId", "patientId");
CREATE INDEX "HealthObservationTrust_code_idx" ON "HealthObservationTrust"("code");
CREATE INDEX "HealthObservationTrust_origin_idx" ON "HealthObservationTrust"("origin");

-- CreateIndex
CREATE UNIQUE INDEX "HealthInferenceTrust_inferenceId_key" ON "HealthInferenceTrust"("inferenceId");
CREATE INDEX "HealthInferenceTrust_workspaceId_patientId_idx" ON "HealthInferenceTrust"("workspaceId", "patientId");
CREATE INDEX "HealthInferenceTrust_modelFamily_modelVersion_idx" ON "HealthInferenceTrust"("modelFamily", "modelVersion");
CREATE INDEX "HealthInferenceTrust_status_idx" ON "HealthInferenceTrust"("status");

-- CreateIndex
CREATE UNIQUE INDEX "HealthActionTrust_actionId_key" ON "HealthActionTrust"("actionId");
CREATE INDEX "HealthActionTrust_workspaceId_patientId_idx" ON "HealthActionTrust"("workspaceId", "patientId");
CREATE INDEX "HealthActionTrust_type_idx" ON "HealthActionTrust"("type");

-- CreateIndex
CREATE UNIQUE INDEX "HealthOutcomeTrust_outcomeId_key" ON "HealthOutcomeTrust"("outcomeId");
CREATE INDEX "HealthOutcomeTrust_workspaceId_patientId_idx" ON "HealthOutcomeTrust"("workspaceId", "patientId");
CREATE INDEX "HealthOutcomeTrust_actionId_idx" ON "HealthOutcomeTrust"("actionId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthProvenanceEvent_eventId_key" ON "HealthProvenanceEvent"("eventId");
CREATE INDEX "HealthProvenanceEvent_workspaceId_aggregateId_idx" ON "HealthProvenanceEvent"("workspaceId", "aggregateId");
CREATE INDEX "HealthProvenanceEvent_workspaceId_patientId_idx" ON "HealthProvenanceEvent"("workspaceId", "patientId");
CREATE INDEX "HealthProvenanceEvent_eventType_idx" ON "HealthProvenanceEvent"("eventType");
CREATE INDEX "HealthProvenanceEvent_correlationId_idx" ON "HealthProvenanceEvent"("correlationId");

-- CreateIndex
CREATE INDEX "HealthCorrectionTrust_workspaceId_patientId_idx" ON "HealthCorrectionTrust"("workspaceId", "patientId");
CREATE INDEX "HealthCorrectionTrust_recordId_idx" ON "HealthCorrectionTrust"("recordId");
CREATE INDEX "HealthCorrectionTrust_reviewStatus_idx" ON "HealthCorrectionTrust"("reviewStatus");

-- AddForeignKey
ALTER TABLE "HealthDeviceTrustProfile" ADD CONSTRAINT "HealthDeviceTrustProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthProvenanceRecord" ADD CONSTRAINT "HealthProvenanceRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthProvenanceRecord" ADD CONSTRAINT "HealthProvenanceRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthObservationTrust" ADD CONSTRAINT "HealthObservationTrust_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthObservationTrust" ADD CONSTRAINT "HealthObservationTrust_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthInferenceTrust" ADD CONSTRAINT "HealthInferenceTrust_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthInferenceTrust" ADD CONSTRAINT "HealthInferenceTrust_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthActionTrust" ADD CONSTRAINT "HealthActionTrust_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthActionTrust" ADD CONSTRAINT "HealthActionTrust_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthOutcomeTrust" ADD CONSTRAINT "HealthOutcomeTrust_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthOutcomeTrust" ADD CONSTRAINT "HealthOutcomeTrust_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthProvenanceEvent" ADD CONSTRAINT "HealthProvenanceEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthProvenanceEvent" ADD CONSTRAINT "HealthProvenanceEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCorrectionTrust" ADD CONSTRAINT "HealthCorrectionTrust_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthCorrectionTrust" ADD CONSTRAINT "HealthCorrectionTrust_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
