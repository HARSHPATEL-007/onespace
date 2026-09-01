-- AMR-CVC — AI Model Registry & Clinical Validation Center
-- FDA lifecycle + PCCP (description/protocol/impact), TRIPOD+AI, G0-G5 gates, shadow/canary, champion-challenger, drift Green/Amber/Red

-- CreateEnum
CREATE TYPE "EvidenceTier" AS ENUM ('E0', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6');

-- CreateEnum
CREATE TYPE "ReleaseChannel" AS ENUM ('RESEARCH', 'SHADOW', 'CANARY', 'PRODUCTION', 'RETIRED');

-- CreateEnum
CREATE TYPE "ModelStatusDetailed" AS ENUM ('DRAFT', 'VALIDATING', 'APPROVED', 'SUSPENDED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ValidationDesign" AS ENUM ('RETROSPECTIVE_INTERNAL', 'RETROSPECTIVE_EXTERNAL', 'TEMPORAL', 'PROSPECTIVE_SILENT', 'PROSPECTIVE_INTERVENTIONAL', 'STANDARD_CARE_COMPARISON', 'CLINICIAN_COMPARISON', 'WORKFLOW_SIMULATION', 'HUMAN_FACTORS');

-- CreateEnum
CREATE TYPE "DeploymentGate" AS ENUM ('G0', 'G1', 'G2', 'G3', 'G4', 'G5');

-- CreateEnum
CREATE TYPE "ChangeClass" AS ENUM ('C0', 'C1', 'C2', 'C3');

-- CreateEnum
CREATE TYPE "DriftType" AS ENUM ('DATA', 'CONCEPT', 'PERFORMANCE', 'DEVICE', 'WORKFLOW');

-- CreateEnum
CREATE TYPE "DriftLevel" AS ENUM ('GREEN', 'AMBER', 'RED');

-- CreateTable
CREATE TABLE "HealthDataset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "sourceOrg" TEXT,
    "collectionStart" TIMESTAMP(3),
    "collectionEnd" TIMESTAMP(3),
    "geography" TEXT,
    "careSettings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "patientCount" INTEGER,
    "encounterCount" INTEGER,
    "modality" TEXT,
    "inclusionCriteria" TEXT,
    "exclusionCriteria" TEXT,
    "labelDefinition" TEXT,
    "labelerQualification" TEXT,
    "interRaterAgreement" DOUBLE PRECISION,
    "missingness" JSONB NOT NULL DEFAULT '{}',
    "units" TEXT,
    "deviceManufacturers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deviceFirmware" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "consentBasis" TEXT,
    "dataUseRestrictions" TEXT,
    "licenseTerms" TEXT,
    "deidentificationMethod" TEXT,
    "reidentificationRisk" DOUBLE PRECISION,
    "retentionPeriod" TEXT,
    "transformationHistory" JSONB NOT NULL DEFAULT '[]',
    "knownBiases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "leakageRisks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "restrictedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lineageGraph" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthValidationStudy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "design" "ValidationDesign" NOT NULL,
    "evidenceTier" "EvidenceTier" NOT NULL DEFAULT 'E1',
    "datasetId" TEXT,
    "protocol" JSONB NOT NULL DEFAULT '{}',
    "results" JSONB NOT NULL DEFAULT '{}',
    "subgroupAnalysis" JSONB NOT NULL DEFAULT '{}',
    "calibrationAnalysis" JSONB NOT NULL DEFAULT '{}',
    "missingDataAnalysis" JSONB NOT NULL DEFAULT '{}',
    "robustnessTesting" JSONB NOT NULL DEFAULT '{}',
    "humanFactorsTesting" JSONB NOT NULL DEFAULT '{}',
    "cybersecurityAssessment" JSONB NOT NULL DEFAULT '{}',
    "privacyAssessment" JSONB NOT NULL DEFAULT '{}',
    "fmea" JSONB NOT NULL DEFAULT '{}',
    "residualRisk" TEXT,
    "reviewerSignOff" TEXT,
    "regulatoryAssessment" JSONB NOT NULL DEFAULT '{}',
    "monitoringPlan" JSONB NOT NULL DEFAULT '{}',
    "changeControlPlan" JSONB NOT NULL DEFAULT '{}',
    "rollbackPlan" TEXT,
    "labeling" JSONB NOT NULL DEFAULT '{}',
    "sampleSize" INTEGER,
    "comparator" TEXT,
    "confidenceIntervals" JSONB NOT NULL DEFAULT '{}',
    "validationDate" TIMESTAMP(3),
    "jurisdiction" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthValidationStudy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthEvidenceClaim" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelVersion" TEXT,
    "claimType" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "confidenceInterval" JSONB NOT NULL DEFAULT '{}',
    "population" TEXT,
    "siteCount" INTEGER,
    "sampleSize" INTEGER,
    "outcomeDefinition" TEXT,
    "predictionHorizon" TEXT,
    "comparator" TEXT,
    "validationDesign" TEXT,
    "dataCutoff" TIMESTAMP(3),
    "reviewStatus" TEXT NOT NULL DEFAULT 'unverified',
    "regulatoryStatus" TEXT,
    "expiresAt" TIMESTAMP(3),
    "sourceDocument" TEXT,
    "datasetId" TEXT,
    "jurisdiction" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthEvidenceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthModelCard" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "cardType" TEXT NOT NULL DEFAULT 'model',
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL DEFAULT '{}',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthModelCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthRegulatoryStatus" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelVersion" TEXT,
    "classification" TEXT,
    "pathway" TEXT,
    "submissionStatus" TEXT,
    "clearanceNumber" TEXT,
    "approvedIndication" TEXT,
    "approvedPopulation" TEXT,
    "approvedVersion" TEXT,
    "approvedHardware" TEXT,
    "approvedJurisdiction" TEXT,
    "labelingRestrictions" TEXT,
    "changeControlRestrictions" TEXT,
    "postMarketObligations" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthRegulatoryStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthDeployment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "gate" "DeploymentGate" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "channel" "ReleaseChannel" NOT NULL DEFAULT 'RESEARCH',
    "tenantRouting" JSONB NOT NULL DEFAULT '{}',
    "siteRouting" JSONB NOT NULL DEFAULT '{}',
    "percentage" INTEGER,
    "featureFlag" TEXT,
    "safetyOwnerApproval" TEXT,
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "rollbackEnabled" BOOLEAN NOT NULL DEFAULT true,
    "championModelId" TEXT,
    "challengerModelId" TEXT,
    "comparisonMetrics" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthDriftSignal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelVersion" TEXT,
    "driftType" "DriftType" NOT NULL,
    "level" "DriftLevel" NOT NULL DEFAULT 'GREEN',
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "thresholdAmber" DOUBLE PRECISION,
    "thresholdRed" DOUBLE PRECISION,
    "details" JSONB NOT NULL DEFAULT '{}',
    "action" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthDriftSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthChangeControl" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelVersion" TEXT,
    "changeClass" "ChangeClass" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "pccpDescription" JSONB NOT NULL DEFAULT '{}',
    "pccpProtocol" JSONB NOT NULL DEFAULT '{}',
    "pccpImpact" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthChangeControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPostMarketReport" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelVersion" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "realWorldPerformance" JSONB NOT NULL DEFAULT '{}',
    "complaints" JSONB NOT NULL DEFAULT '[]',
    "adverseEvents" JSONB NOT NULL DEFAULT '[]',
    "nearMisses" JSONB NOT NULL DEFAULT '[]',
    "overrides" JSONB NOT NULL DEFAULT '[]',
    "subgroupDisparities" JSONB NOT NULL DEFAULT '{}',
    "deviceBehavior" JSONB NOT NULL DEFAULT '{}',
    "driftSummary" JSONB NOT NULL DEFAULT '{}',
    "updates" JSONB NOT NULL DEFAULT '[]',
    "downtime" JSONB NOT NULL DEFAULT '[]',
    "capa" JSONB NOT NULL DEFAULT '[]',
    "labelUpdates" JSONB NOT NULL DEFAULT '[]',
    "regulatoryReporting" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthPostMarketReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthClinicalReview" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelVersion" TEXT,
    "decision" TEXT NOT NULL,
    "evidenceReviewed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "knownLimitations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "residualRisk" TEXT,
    "requiredControls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvedPopulations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvedJurisdictions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "monitoringObligations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "owners" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthClinicalReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthDataset_workspaceId_name_version_key" ON "HealthDataset"("workspaceId", "name", "version");
CREATE INDEX "HealthDataset_workspaceId_idx" ON "HealthDataset"("workspaceId");

-- CreateIndex
CREATE INDEX "HealthValidationStudy_workspaceId_modelId_idx" ON "HealthValidationStudy"("workspaceId", "modelId");
CREATE INDEX "HealthValidationStudy_workspaceId_evidenceTier_idx" ON "HealthValidationStudy"("workspaceId", "evidenceTier");

-- CreateIndex
CREATE UNIQUE INDEX "HealthEvidenceClaim_workspaceId_claimId_key" ON "HealthEvidenceClaim"("workspaceId", "claimId");
CREATE INDEX "HealthEvidenceClaim_workspaceId_modelId_idx" ON "HealthEvidenceClaim"("workspaceId", "modelId");
CREATE INDEX "HealthEvidenceClaim_workspaceId_status_idx" ON "HealthEvidenceClaim"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HealthModelCard_workspaceId_modelId_modelVersion_cardType_key" ON "HealthModelCard"("workspaceId", "modelId", "modelVersion", "cardType");
CREATE INDEX "HealthModelCard_workspaceId_modelId_idx" ON "HealthModelCard"("workspaceId", "modelId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthRegulatoryStatus_workspaceId_modelId_modelVersion_key" ON "HealthRegulatoryStatus"("workspaceId", "modelId", "modelVersion");
CREATE INDEX "HealthRegulatoryStatus_workspaceId_modelId_idx" ON "HealthRegulatoryStatus"("workspaceId", "modelId");

-- CreateIndex
CREATE INDEX "HealthDeployment_workspaceId_modelId_idx" ON "HealthDeployment"("workspaceId", "modelId");
CREATE INDEX "HealthDeployment_workspaceId_gate_idx" ON "HealthDeployment"("workspaceId", "gate");

-- CreateIndex
CREATE INDEX "HealthDriftSignal_workspaceId_modelId_idx" ON "HealthDriftSignal"("workspaceId", "modelId");
CREATE INDEX "HealthDriftSignal_workspaceId_driftType_idx" ON "HealthDriftSignal"("workspaceId", "driftType");
CREATE INDEX "HealthDriftSignal_workspaceId_level_idx" ON "HealthDriftSignal"("workspaceId", "level");

-- CreateIndex
CREATE INDEX "HealthChangeControl_workspaceId_modelId_idx" ON "HealthChangeControl"("workspaceId", "modelId");
CREATE INDEX "HealthChangeControl_workspaceId_changeClass_idx" ON "HealthChangeControl"("workspaceId", "changeClass");

-- CreateIndex
CREATE INDEX "HealthPostMarketReport_workspaceId_modelId_idx" ON "HealthPostMarketReport"("workspaceId", "modelId");

-- CreateIndex
CREATE INDEX "HealthClinicalReview_workspaceId_modelId_idx" ON "HealthClinicalReview"("workspaceId", "modelId");

-- AddForeignKey
ALTER TABLE "HealthDataset" ADD CONSTRAINT "HealthDataset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthValidationStudy" ADD CONSTRAINT "HealthValidationStudy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthValidationStudy" ADD CONSTRAINT "HealthValidationStudy_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "HealthDataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthEvidenceClaim" ADD CONSTRAINT "HealthEvidenceClaim_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthEvidenceClaim" ADD CONSTRAINT "HealthEvidenceClaim_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "HealthDataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthModelCard" ADD CONSTRAINT "HealthModelCard_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthRegulatoryStatus" ADD CONSTRAINT "HealthRegulatoryStatus_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthDeployment" ADD CONSTRAINT "HealthDeployment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthDriftSignal" ADD CONSTRAINT "HealthDriftSignal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthChangeControl" ADD CONSTRAINT "HealthChangeControl_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPostMarketReport" ADD CONSTRAINT "HealthPostMarketReport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthClinicalReview" ADD CONSTRAINT "HealthClinicalReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: retire fixed claims as unverified, set feature status
INSERT INTO "HealthModelCard" ("id", "workspaceId", "modelId", "modelVersion", "cardType", "title", "content", "version", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "Workspace"."id", 'sepsis-risk-v3', '3.4.1', 'safety', 'Safety Card — Sepsis Risk', '{"hazard_summary":"Missed or false sepsis alerts","risk_class":"S4","unsafe_scenarios":["Stale vitals","Single wearable"],"abstention":["Input stale >30m","Quality <0.85"],"human_review":"attending_or_rapid_response","monitoring":["calibration_error","subgroup_sensitivity_gap"],"residual_risk":"Low with controls"}'::jsonb, '1.0.0', 'approved', NOW(), NOW() FROM "Workspace" ON CONFLICT DO NOTHING;

INSERT INTO "HealthDeployment" ("id", "workspaceId", "modelId", "modelVersion", "gate", "status", "channel", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "Workspace"."id", 'sepsis-risk-v3', '3.4.1', 'G2', 'passed', 'SHADOW', NOW(), NOW() FROM "Workspace" ON CONFLICT DO NOTHING;
