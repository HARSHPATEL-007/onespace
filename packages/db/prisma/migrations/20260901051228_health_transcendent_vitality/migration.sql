-- CreateEnum
CREATE TYPE "VideoProjectStatus" AS ENUM ('DRAFT', 'IN_PRODUCTION', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "VideoStorageTier" AS ENUM ('HOT', 'WARM', 'COOL', 'COLD', 'FROZEN', 'CRYOGENIC', 'DELETED', 'PURGED');

-- CreateEnum
CREATE TYPE "VideoExportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VideoTranscodeStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HealthVitalLayer" AS ENUM ('CARDIOVASCULAR', 'METABOLIC', 'NEUROLOGICAL', 'RESPIRATORY', 'MUSCULOSKELETAL', 'DERMATOLOGICAL', 'GASTROINTESTINAL', 'IMMUNOLOGICAL', 'GENOMIC', 'ENVIRONMENTAL', 'BEHAVIORAL', 'QUANTUM_BIOLOGICAL');

-- CreateEnum
CREATE TYPE "HealthEncounterType" AS ENUM ('OUTPATIENT', 'INPATIENT', 'EMERGENCY', 'TELEHEALTH', 'HOME_VISIT', 'VIRTUAL', 'SURGERY', 'LAB', 'IMAGING');

-- DropIndex
DROP INDEX "ChatAttachment_workspaceId_id_idx";

-- DropIndex
DROP INDEX "ChatMessage_authorName_trgm_idx";

-- DropIndex
DROP INDEX "ChatMessage_body_trgm_idx";

-- DropIndex
DROP INDEX "ChatSearchIndex_searchVector_trgm_idx";

-- CreateTable
CREATE TABLE "VideoProject" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "VideoProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "category" TEXT NOT NULL DEFAULT 'general',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "thumbnailUrl" TEXT,
    "durationSec" INTEGER,
    "resolution" TEXT DEFAULT '1080p',
    "timeline" JSONB NOT NULL DEFAULT '{"tracks":[],"markers":[],"chapters":[]}',
    "hyperContext" JSONB NOT NULL DEFAULT '{}',
    "neuralEmbedding" JSONB,
    "workspaceNexus" JSONB NOT NULL DEFAULT '{}',
    "n0va10State" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoAsset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "createdById" TEXT,
    "filename" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT 'video/mp4',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "frameRate" DOUBLE PRECISION,
    "bitDepth" INTEGER DEFAULT 8,
    "codec" TEXT DEFAULT 'h264',
    "container" TEXT DEFAULT 'mp4',
    "storageKey" TEXT NOT NULL DEFAULT '',
    "storageTier" "VideoStorageTier" NOT NULL DEFAULT 'HOT',
    "thumbnailKey" TEXT,
    "proxyKey" TEXT,
    "waveformKey" TEXT,
    "checksumSha3" TEXT,
    "perceptualHash" TEXT,
    "neuralMetadata" JSONB NOT NULL DEFAULT '{}',
    "technicalSpecs" JSONB NOT NULL DEFAULT '{}',
    "uploadStatus" TEXT NOT NULL DEFAULT 'ready',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoExport" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "videoId" TEXT,
    "preset" TEXT NOT NULL DEFAULT 'youtube_4k',
    "format" JSONB NOT NULL DEFAULT '{"container":"mp4","codec":"h264"}',
    "status" "VideoExportStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "outputUrl" TEXT,
    "cdnUrl" TEXT,
    "thumbnailUrl" TEXT,
    "fileSizeBytes" INTEGER,
    "renderNode" TEXT,
    "neuralOptimization" JSONB NOT NULL DEFAULT '{}',
    "drm" JSONB NOT NULL DEFAULT '{}',
    "delivery" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoReviewComment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "videoId" TEXT,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "timecodeMs" INTEGER,
    "frameNumber" INTEGER,
    "type" TEXT NOT NULL DEFAULT 'general',
    "drawingData" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoReviewComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoCaption" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "assetId" TEXT,
    "videoId" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "kind" TEXT NOT NULL DEFAULT 'captions',
    "status" TEXT NOT NULL DEFAULT 'ready',
    "vttContent" TEXT NOT NULL DEFAULT '',
    "srtContent" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.98,
    "speakerLabels" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoCaption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoAnalyticsEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "videoId" TEXT,
    "exportId" TEXT,
    "granularity" TEXT NOT NULL DEFAULT 'hour',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewsTotal" INTEGER NOT NULL DEFAULT 0,
    "viewsUnique" INTEGER NOT NULL DEFAULT 0,
    "watchTimeSec" INTEGER NOT NULL DEFAULT 0,
    "avgWatchSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "engagementRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionCurve" JSONB NOT NULL DEFAULT '[]',
    "demographics" JSONB NOT NULL DEFAULT '{}',
    "devices" JSONB NOT NULL DEFAULT '{}',
    "platforms" JSONB NOT NULL DEFAULT '{}',
    "trafficSources" JSONB NOT NULL DEFAULT '{}',
    "neuralAnalytics" JSONB NOT NULL DEFAULT '{}',
    "heatmapData" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoAnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoTranscode" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "assetId" TEXT,
    "sourceKey" TEXT NOT NULL,
    "targetCodec" TEXT NOT NULL DEFAULT 'h264',
    "targetResolution" TEXT NOT NULL DEFAULT '1080p',
    "targetBitrate" INTEGER,
    "status" "VideoTranscodeStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "inputSpecs" JSONB NOT NULL DEFAULT '{}',
    "outputSpecs" JSONB NOT NULL DEFAULT '{}',
    "gpuNode" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoTranscode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPatient" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "mrn" TEXT,
    "externalId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dob" TIMESTAMP(3),
    "sex" TEXT,
    "genderIdentity" TEXT,
    "bloodType" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "phone" TEXT,
    "email" TEXT,
    "address" JSONB,
    "emergencyContact" JSONB,
    "insurance" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "twinId" TEXT,
    "consentJson" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "HealthPatient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthBioTwin" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '2026.07.12.1',
    "anatomy" JSONB NOT NULL DEFAULT '{}',
    "biomarkerBaselines" JSONB NOT NULL DEFAULT '{}',
    "epigeneticClock" JSONB NOT NULL DEFAULT '{}',
    "temporalHealth" JSONB NOT NULL DEFAULT '{}',
    "exposome" JSONB NOT NULL DEFAULT '{}',
    "microbiome" JSONB NOT NULL DEFAULT '{}',
    "pharmacogenomics" JSONB NOT NULL DEFAULT '{}',
    "neuralEmbedding" JSONB NOT NULL DEFAULT '{}',
    "trajectoryVector" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthBioTwin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthVital" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "deviceId" TEXT,
    "layer" "HealthVitalLayer" NOT NULL DEFAULT 'CARDIOVASCULAR',
    "heartRate" INTEGER,
    "hrvSdnn" DOUBLE PRECISION,
    "bpSystolic" INTEGER,
    "bpDiastolic" INTEGER,
    "spo2" DOUBLE PRECISION,
    "respiratoryRate" INTEGER,
    "temperatureC" DOUBLE PRECISION,
    "glucoseMgDl" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION,
    "signals" JSONB NOT NULL DEFAULT '{}',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthVital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthDevice" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "family" TEXT NOT NULL DEFAULT 'wearable',
    "protocol" TEXT NOT NULL DEFAULT 'BLUETOOTH_LE',
    "status" TEXT NOT NULL DEFAULT 'active',
    "firmwareVersion" TEXT,
    "batteryPct" INTEGER,
    "signalQuality" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "lastSyncAt" TIMESTAMP(3),
    "assignedPatientId" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthDevicePatient" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HealthDevicePatient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthEncounter" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" "HealthEncounterType" NOT NULL DEFAULT 'OUTPATIENT',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "providerId" TEXT,
    "providerName" TEXT,
    "location" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "chiefComplaint" TEXT,
    "diagnosisCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT NOT NULL DEFAULT '',
    "vitalsSnapshot" JSONB NOT NULL DEFAULT '{}',
    "fhirResource" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthEncounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCarePlan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "status" TEXT NOT NULL DEFAULT 'active',
    "conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "activities" JSONB NOT NULL DEFAULT '[]',
    "goals" JSONB NOT NULL DEFAULT '[]',
    "teamMembers" JSONB NOT NULL DEFAULT '[]',
    "fhirCarePlan" JSONB,
    "adherenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCarePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthMedication" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "drugName" TEXT NOT NULL,
    "genericName" TEXT,
    "rxcui" TEXT,
    "dosage" TEXT,
    "route" TEXT DEFAULT 'PO',
    "frequency" TEXT,
    "duration" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "prescriber" TEXT,
    "pharmacy" TEXT,
    "ndc" TEXT,
    "lotNumber" TEXT,
    "interactionChecked" BOOLEAN NOT NULL DEFAULT false,
    "adherencePct" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "fhirMedicationRequest" JSONB,
    "prescribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthMedication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthLabResult" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "testName" TEXT NOT NULL,
    "loinc" TEXT,
    "category" TEXT NOT NULL DEFAULT 'laboratory',
    "value" TEXT,
    "numericValue" DOUBLE PRECISION,
    "unit" TEXT,
    "referenceRange" TEXT,
    "status" TEXT NOT NULL DEFAULT 'final',
    "abnormal" BOOLEAN NOT NULL DEFAULT false,
    "specimenId" TEXT,
    "performer" TEXT,
    "fhirObservation" JSONB,
    "resultedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthLabResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthImagingStudy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "modality" TEXT NOT NULL DEFAULT 'CT',
    "bodySite" TEXT,
    "description" TEXT,
    "accessionNumber" TEXT,
    "dicomStudyUid" TEXT,
    "seriesCount" INTEGER NOT NULL DEFAULT 0,
    "instanceCount" INTEGER NOT NULL DEFAULT 0,
    "aiFindings" JSONB NOT NULL DEFAULT '[]',
    "fhirImagingStudy" JSONB,
    "status" TEXT NOT NULL DEFAULT 'available',
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthImagingStudy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthAlert" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT,
    "encounterId" TEXT,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'moderate',
    "status" TEXT NOT NULL DEFAULT 'active',
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "horizon" TEXT,
    "message" TEXT NOT NULL,
    "explainability" JSONB NOT NULL DEFAULT '{}',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthWellnessPlan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "goals" JSONB NOT NULL DEFAULT '[]',
    "nutrition" JSONB NOT NULL DEFAULT '{}',
    "fitness" JSONB NOT NULL DEFAULT '{}',
    "sleep" JSONB NOT NULL DEFAULT '{}',
    "mentalHealth" JSONB NOT NULL DEFAULT '{}',
    "womensHealth" JSONB NOT NULL DEFAULT '{}',
    "longevity" JSONB NOT NULL DEFAULT '{}',
    "adherenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "biologicalAge" DOUBLE PRECISION,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthWellnessPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthTelehealthSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "providerId" TEXT,
    "providerName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "modality" TEXT NOT NULL DEFAULT 'video',
    "meetRoomId" TEXT,
    "recordingUrl" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "fhirAppointment" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthTelehealthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthFhirSync" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "system" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" JSONB,
    "error" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthFhirSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthAgentRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "agentName" TEXT,
    "intent" TEXT,
    "patientId" TEXT,
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB NOT NULL DEFAULT '{}',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "crossModuleActions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthAgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoProject_workspaceId_status_updatedAt_idx" ON "VideoProject"("workspaceId", "status", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "VideoProject_workspaceId_createdById_idx" ON "VideoProject"("workspaceId", "createdById");

-- CreateIndex
CREATE INDEX "VideoAsset_workspaceId_projectId_createdAt_idx" ON "VideoAsset"("workspaceId", "projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "VideoAsset_workspaceId_storageTier_idx" ON "VideoAsset"("workspaceId", "storageTier");

-- CreateIndex
CREATE INDEX "VideoExport_workspaceId_status_createdAt_idx" ON "VideoExport"("workspaceId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "VideoExport_projectId_idx" ON "VideoExport"("projectId");

-- CreateIndex
CREATE INDEX "VideoReviewComment_workspaceId_projectId_createdAt_idx" ON "VideoReviewComment"("workspaceId", "projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "VideoReviewComment_projectId_timecodeMs_idx" ON "VideoReviewComment"("projectId", "timecodeMs");

-- CreateIndex
CREATE INDEX "VideoCaption_workspaceId_projectId_language_idx" ON "VideoCaption"("workspaceId", "projectId", "language");

-- CreateIndex
CREATE INDEX "VideoAnalyticsEvent_workspaceId_projectId_timestamp_idx" ON "VideoAnalyticsEvent"("workspaceId", "projectId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "VideoAnalyticsEvent_videoId_granularity_timestamp_idx" ON "VideoAnalyticsEvent"("videoId", "granularity", "timestamp");

-- CreateIndex
CREATE INDEX "VideoTranscode_workspaceId_status_idx" ON "VideoTranscode"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "VideoTranscode_assetId_idx" ON "VideoTranscode"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPatient_twinId_key" ON "HealthPatient"("twinId");

-- CreateIndex
CREATE INDEX "HealthPatient_workspaceId_lastName_idx" ON "HealthPatient"("workspaceId", "lastName");

-- CreateIndex
CREATE INDEX "HealthPatient_workspaceId_status_idx" ON "HealthPatient"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "HealthPatient_workspaceId_riskScore_idx" ON "HealthPatient"("workspaceId", "riskScore" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "HealthPatient_workspaceId_mrn_key" ON "HealthPatient"("workspaceId", "mrn");

-- CreateIndex
CREATE UNIQUE INDEX "HealthBioTwin_patientId_key" ON "HealthBioTwin"("patientId");

-- CreateIndex
CREATE INDEX "HealthBioTwin_workspaceId_idx" ON "HealthBioTwin"("workspaceId");

-- CreateIndex
CREATE INDEX "HealthVital_workspaceId_patientId_recordedAt_idx" ON "HealthVital"("workspaceId", "patientId", "recordedAt" DESC);

-- CreateIndex
CREATE INDEX "HealthVital_workspaceId_layer_idx" ON "HealthVital"("workspaceId", "layer");

-- CreateIndex
CREATE INDEX "HealthVital_deviceId_idx" ON "HealthVital"("deviceId");

-- CreateIndex
CREATE INDEX "HealthDevice_workspaceId_status_idx" ON "HealthDevice"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "HealthDevice_workspaceId_family_idx" ON "HealthDevice"("workspaceId", "family");

-- CreateIndex
CREATE INDEX "HealthDevice_assignedPatientId_idx" ON "HealthDevice"("assignedPatientId");

-- CreateIndex
CREATE INDEX "HealthDevicePatient_patientId_idx" ON "HealthDevicePatient"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthDevicePatient_deviceId_patientId_key" ON "HealthDevicePatient"("deviceId", "patientId");

-- CreateIndex
CREATE INDEX "HealthEncounter_workspaceId_patientId_scheduledAt_idx" ON "HealthEncounter"("workspaceId", "patientId", "scheduledAt" DESC);

-- CreateIndex
CREATE INDEX "HealthEncounter_workspaceId_status_idx" ON "HealthEncounter"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "HealthCarePlan_workspaceId_patientId_status_idx" ON "HealthCarePlan"("workspaceId", "patientId", "status");

-- CreateIndex
CREATE INDEX "HealthMedication_workspaceId_patientId_status_idx" ON "HealthMedication"("workspaceId", "patientId", "status");

-- CreateIndex
CREATE INDEX "HealthMedication_workspaceId_drugName_idx" ON "HealthMedication"("workspaceId", "drugName");

-- CreateIndex
CREATE INDEX "HealthLabResult_workspaceId_patientId_resultedAt_idx" ON "HealthLabResult"("workspaceId", "patientId", "resultedAt" DESC);

-- CreateIndex
CREATE INDEX "HealthLabResult_workspaceId_testName_idx" ON "HealthLabResult"("workspaceId", "testName");

-- CreateIndex
CREATE INDEX "HealthImagingStudy_workspaceId_patientId_idx" ON "HealthImagingStudy"("workspaceId", "patientId");

-- CreateIndex
CREATE INDEX "HealthImagingStudy_workspaceId_modality_idx" ON "HealthImagingStudy"("workspaceId", "modality");

-- CreateIndex
CREATE INDEX "HealthAlert_workspaceId_status_severity_idx" ON "HealthAlert"("workspaceId", "status", "severity");

-- CreateIndex
CREATE INDEX "HealthAlert_workspaceId_patientId_idx" ON "HealthAlert"("workspaceId", "patientId");

-- CreateIndex
CREATE INDEX "HealthAlert_workspaceId_kind_idx" ON "HealthAlert"("workspaceId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "HealthWellnessPlan_patientId_key" ON "HealthWellnessPlan"("patientId");

-- CreateIndex
CREATE INDEX "HealthWellnessPlan_workspaceId_idx" ON "HealthWellnessPlan"("workspaceId");

-- CreateIndex
CREATE INDEX "HealthTelehealthSession_workspaceId_patientId_scheduledAt_idx" ON "HealthTelehealthSession"("workspaceId", "patientId", "scheduledAt" DESC);

-- CreateIndex
CREATE INDEX "HealthTelehealthSession_workspaceId_status_idx" ON "HealthTelehealthSession"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "HealthFhirSync_workspaceId_resourceType_idx" ON "HealthFhirSync"("workspaceId", "resourceType");

-- CreateIndex
CREATE INDEX "HealthFhirSync_workspaceId_status_idx" ON "HealthFhirSync"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "HealthAgentRun_workspaceId_agentId_idx" ON "HealthAgentRun"("workspaceId", "agentId");

-- CreateIndex
CREATE INDEX "HealthAgentRun_workspaceId_patientId_idx" ON "HealthAgentRun"("workspaceId", "patientId");

-- AddForeignKey
ALTER TABLE "VideoProject" ADD CONSTRAINT "VideoProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoProject" ADD CONSTRAINT "VideoProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAsset" ADD CONSTRAINT "VideoAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAsset" ADD CONSTRAINT "VideoAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAsset" ADD CONSTRAINT "VideoAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoExport" ADD CONSTRAINT "VideoExport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoExport" ADD CONSTRAINT "VideoExport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoReviewComment" ADD CONSTRAINT "VideoReviewComment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoReviewComment" ADD CONSTRAINT "VideoReviewComment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCaption" ADD CONSTRAINT "VideoCaption_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCaption" ADD CONSTRAINT "VideoCaption_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAnalyticsEvent" ADD CONSTRAINT "VideoAnalyticsEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAnalyticsEvent" ADD CONSTRAINT "VideoAnalyticsEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTranscode" ADD CONSTRAINT "VideoTranscode_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTranscode" ADD CONSTRAINT "VideoTranscode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPatient" ADD CONSTRAINT "HealthPatient_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthBioTwin" ADD CONSTRAINT "HealthBioTwin_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthBioTwin" ADD CONSTRAINT "HealthBioTwin_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthVital" ADD CONSTRAINT "HealthVital_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthVital" ADD CONSTRAINT "HealthVital_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthVital" ADD CONSTRAINT "HealthVital_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "HealthEncounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthVital" ADD CONSTRAINT "HealthVital_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "HealthDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthDevice" ADD CONSTRAINT "HealthDevice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthDevicePatient" ADD CONSTRAINT "HealthDevicePatient_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "HealthDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthDevicePatient" ADD CONSTRAINT "HealthDevicePatient_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthEncounter" ADD CONSTRAINT "HealthEncounter_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthEncounter" ADD CONSTRAINT "HealthEncounter_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCarePlan" ADD CONSTRAINT "HealthCarePlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCarePlan" ADD CONSTRAINT "HealthCarePlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthMedication" ADD CONSTRAINT "HealthMedication_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthMedication" ADD CONSTRAINT "HealthMedication_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthLabResult" ADD CONSTRAINT "HealthLabResult_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthLabResult" ADD CONSTRAINT "HealthLabResult_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthImagingStudy" ADD CONSTRAINT "HealthImagingStudy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthImagingStudy" ADD CONSTRAINT "HealthImagingStudy_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthAlert" ADD CONSTRAINT "HealthAlert_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthWellnessPlan" ADD CONSTRAINT "HealthWellnessPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthWellnessPlan" ADD CONSTRAINT "HealthWellnessPlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthTelehealthSession" ADD CONSTRAINT "HealthTelehealthSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthFhirSync" ADD CONSTRAINT "HealthFhirSync_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthAgentRun" ADD CONSTRAINT "HealthAgentRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
