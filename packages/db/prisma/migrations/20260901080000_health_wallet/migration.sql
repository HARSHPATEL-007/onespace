-- Patient Health Data Wallet — policy-enforcing privacy control plane
-- HL7 FHIR Consent, HIPAA access/amendment/restriction/accounting, GDPR erasure/restriction/portability
-- PDP/PEP across 21 layers, 12 data domains, 7 consent dimensions, 11 PDP decisions

-- CreateEnum
CREATE TYPE "WalletConsentStatus" AS ENUM ('ACTIVE', 'EXPIRING_SOON', 'PAUSED', 'REVOKED', 'UNDER_REVIEW', 'EMERGENCY_OVERRIDE', 'ENFORCEMENT_PENDING', 'UNABLE_TO_DELETE', 'RESEARCH_WITHDRAWAL_COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WalletDataDomain" AS ENUM ('GENERAL_MEDICAL', 'MENTAL_HEALTH', 'SUBSTANCE_USE', 'GENOMICS', 'REPRODUCTIVE_HEALTH', 'VOICE_RECORDINGS', 'BEHAVIORAL', 'BIOMETRIC', 'LOCATION', 'RESEARCH_DATA', 'ENVIRONMENTAL', 'FINANCIAL_INSURANCE');

-- CreateEnum
CREATE TYPE "WalletPurpose" AS ENUM ('TREATMENT', 'PAYMENT', 'CARE_COORDINATION', 'WELLNESS', 'RESEARCH', 'QUALITY_IMPROVEMENT', 'PUBLIC_HEALTH', 'EMERGENCY_RESPONSE', 'PRODUCT_IMPROVEMENT');

-- CreateEnum
CREATE TYPE "WalletAction" AS ENUM ('VIEW', 'DOWNLOAD', 'ANALYZE', 'INFER', 'SHARE', 'TRAIN_MODEL', 'CONTACT_PATIENT', 'CREATE_TASK', 'TRIGGER_ALERT');

-- CreateEnum
CREATE TYPE "WalletProcessingMode" AS ENUM ('LOCAL_ONLY', 'CONFIDENTIAL_CLOUD', 'DEIDENTIFIED', 'FEDERATED', 'AGGREGATE_ONLY', 'HUMAN_REVIEWED', 'NO_TRAINING', 'NO_INFERENCE');

-- CreateEnum
CREATE TYPE "WalletProxyRelationship" AS ENUM ('PARENT', 'LEGAL_GUARDIAN', 'CAREGIVER', 'SPOUSE_PARTNER', 'HEALTHCARE_PROXY', 'POWER_OF_ATTORNEY', 'TRUSTED_CONTACT', 'HOME_HEALTH_WORKER', 'RESEARCH_DELEGATE', 'EMERGENCY_CONTACT', 'INSTITUTIONAL_REPRESENTATIVE');

-- CreateEnum
CREATE TYPE "WalletExportFormat" AS ENUM ('FHIR_R4_BUNDLE', 'C_CDA', 'DICOM', 'CSV', 'JSON', 'MED_LIST', 'CONSENT_HISTORY', 'ACCESS_HISTORY');

-- CreateEnum
CREATE TYPE "WalletDeletionStatus" AS ENUM ('PENDING', 'DELETED', 'ANONYMIZED', 'RESTRICTED', 'RETAINED_BY_LAW', 'UNREACHABLE', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "HealthWalletConsent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "status" "WalletConsentStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "recipientType" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "recipientRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dataDomains" "WalletDataDomain"[] DEFAULT ARRAY[]::"WalletDataDomain"[],
    "excludedDomains" "WalletDataDomain"[] DEFAULT ARRAY[]::"WalletDataDomain"[],
    "specificRecords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "derivedAllow" JSONB NOT NULL DEFAULT '{}',
    "purposes" "WalletPurpose"[] DEFAULT ARRAY[]::"WalletPurpose"[],
    "actions" "WalletAction"[] DEFAULT ARRAY[]::"WalletAction"[],
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "oneTimeUse" BOOLEAN NOT NULL DEFAULT false,
    "reconsentInterval" INTEGER,
    "jurisdictions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "institutions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minimumNecessary" BOOLEAN NOT NULL DEFAULT true,
    "deidentification" TEXT,
    "aggregation" TEXT,
    "humanReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "noOnwardSharing" BOOLEAN NOT NULL DEFAULT false,
    "noAutomatedClinicalAction" BOOLEAN NOT NULL DEFAULT false,
    "noCommercialUse" BOOLEAN NOT NULL DEFAULT false,
    "processingMode" "WalletProcessingMode" NOT NULL DEFAULT 'CONFIDENTIAL_CLOUD',
    "language" TEXT NOT NULL DEFAULT 'en',
    "consentVersion" TEXT NOT NULL DEFAULT 'patient-consent-3.1',
    "explanationShown" BOOLEAN NOT NULL DEFAULT false,
    "understandingConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "signedAt" TIMESTAMP(3),
    "inheritanceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "inheritanceRules" JSONB NOT NULL DEFAULT '{}',
    "fhirConsent" JSONB,
    "policyVersion" TEXT NOT NULL DEFAULT 'wallet-policy-4.2',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "HealthWalletConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthWalletConsentEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "authentication" TEXT,
    "scope" JSONB NOT NULL DEFAULT '{}',
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enforcement" JSONB NOT NULL DEFAULT '{}',
    "previousHash" TEXT,
    "eventHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthWalletConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthWalletAccessLedger" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "consentId" TEXT,
    "accessorId" TEXT,
    "accessorName" TEXT,
    "organization" TEXT,
    "role" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location" TEXT,
    "device" TEXT,
    "dataCategory" "WalletDataDomain" NOT NULL,
    "recordsViewed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "purpose" "WalletPurpose",
    "action" "WalletAction",
    "downloaded" BOOLEAN NOT NULL DEFAULT false,
    "aiInferenceRun" BOOLEAN NOT NULL DEFAULT false,
    "onwardSharing" BOOLEAN NOT NULL DEFAULT false,
    "breakGlass" BOOLEAN NOT NULL DEFAULT false,
    "denied" BOOLEAN NOT NULL DEFAULT false,
    "anomalyDetected" BOOLEAN NOT NULL DEFAULT false,
    "anomalyReason" TEXT,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthWalletAccessLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthWalletDerivedData" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "derivedClass" TEXT NOT NULL,
    "sourceRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "processingPurpose" "WalletPurpose",
    "modelVersion" TEXT,
    "derivedValue" JSONB,
    "confidence" DOUBLE PRECISION,
    "retentionPolicy" TEXT,
    "patientVisible" BOOLEAN NOT NULL DEFAULT true,
    "correctionDependency" TEXT,
    "deletionDependency" TEXT,
    "sharingRestrictions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "canBeUsedForFutureInference" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthWalletDerivedData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthWalletProxy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "proxyUserId" TEXT,
    "proxyEmail" TEXT,
    "proxyName" TEXT,
    "relationship" "WalletProxyRelationship" NOT NULL,
    "permissions" "WalletAction"[] DEFAULT ARRAY[]::"WalletAction"[],
    "dataDomains" "WalletDataDomain"[] DEFAULT ARRAY[]::"WalletDataDomain"[],
    "viewMentalHealth" BOOLEAN NOT NULL DEFAULT false,
    "viewReproductive" BOOLEAN NOT NULL DEFAULT false,
    "viewGenomics" BOOLEAN NOT NULL DEFAULT false,
    "approveResearch" BOOLEAN NOT NULL DEFAULT false,
    "downloadRecords" BOOLEAN NOT NULL DEFAULT false,
    "receiveEmergencyAlerts" BOOLEAN NOT NULL DEFAULT false,
    "manageDevices" BOOLEAN NOT NULL DEFAULT false,
    "actDuringIncapacity" BOOLEAN NOT NULL DEFAULT false,
    "expiration" TIMESTAMP(3),
    "legalDocVerified" BOOLEAN NOT NULL DEFAULT false,
    "dualApproval" BOOLEAN NOT NULL DEFAULT false,
    "stepUpAuth" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthWalletProxy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthWalletResearchStudy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sponsor" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "principalInvestigator" TEXT,
    "researchQuestion" TEXT,
    "dataCategories" "WalletDataDomain"[] DEFAULT ARRAY[]::"WalletDataDomain"[],
    "timePeriod" TEXT,
    "geography" TEXT,
    "studyDuration" TEXT,
    "dataRecipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "commercialInvolvement" BOOLEAN NOT NULL DEFAULT false,
    "geneticAnalysis" BOOLEAN NOT NULL DEFAULT false,
    "aiModelTraining" BOOLEAN NOT NULL DEFAULT false,
    "recontactPermissions" TEXT,
    "returnOfResults" TEXT,
    "compensation" TEXT,
    "withdrawalProcess" TEXT,
    "risks" TEXT,
    "benefits" TEXT,
    "ethicsApproval" TEXT,
    "retentionPeriod" TEXT,
    "publicationPolicy" TEXT,
    "internationalTransfers" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    CONSTRAINT "HealthWalletResearchStudy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthWalletResearchConsent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "consentOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "withdrawalStatus" TEXT NOT NULL DEFAULT 'active',
    "dataCollected" BOOLEAN NOT NULL DEFAULT false,
    "futureCollectionStopped" BOOLEAN NOT NULL DEFAULT false,
    "removedFromCohort" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "HealthWalletResearchConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthWalletExport" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "format" "WalletExportFormat" NOT NULL,
    "scope" JSONB NOT NULL DEFAULT '{}',
    "bundleUrl" TEXT,
    "provenance" JSONB NOT NULL DEFAULT '{}',
    "passphraseProtected" BOOLEAN NOT NULL DEFAULT false,
    "watermark" TEXT,
    "recipientVerified" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "downloaded" BOOLEAN NOT NULL DEFAULT false,
    "downloadedAt" TIMESTAMP(3),
    "revokedBeforeDownload" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthWalletExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthWalletCorrection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "dataDomain" "WalletDataDomain" NOT NULL,
    "originalValue" JSONB NOT NULL,
    "proposedValue" JSONB NOT NULL,
    "reason" TEXT,
    "evidence" JSONB,
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
    "responsibleOrg" TEXT,
    "correctedValue" JSONB,
    "effectiveDate" TIMESTAMP(3),
    "downstreamImpact" JSONB NOT NULL DEFAULT '[]',
    "notifiedRecipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthWalletCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthWalletRestriction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "restrictionType" TEXT NOT NULL,
    "dataDomains" "WalletDataDomain"[] DEFAULT ARRAY[]::"WalletDataDomain"[],
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "purpose" "WalletPurpose",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthWalletRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthWalletDeletionJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "dataDomains" "WalletDataDomain"[] DEFAULT ARRAY[]::"WalletDataDomain"[],
    "asset" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "status" "WalletDeletionStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "requestedById" TEXT,

    CONSTRAINT "HealthWalletDeletionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthWalletConsent_consentId_key" ON "HealthWalletConsent"("consentId");
CREATE INDEX "HealthWalletConsent_workspaceId_patientId_idx" ON "HealthWalletConsent"("workspaceId", "patientId");
CREATE INDEX "HealthWalletConsent_workspaceId_status_idx" ON "HealthWalletConsent"("workspaceId", "status");
CREATE INDEX "HealthWalletConsent_patientId_status_idx" ON "HealthWalletConsent"("patientId", "status");
CREATE INDEX "HealthWalletConsent_validUntil_idx" ON "HealthWalletConsent"("validUntil");

-- CreateIndex
CREATE INDEX "HealthWalletConsentEvent_workspaceId_patientId_idx" ON "HealthWalletConsentEvent"("workspaceId", "patientId");
CREATE INDEX "HealthWalletConsentEvent_consentId_idx" ON "HealthWalletConsentEvent"("consentId");
CREATE INDEX "HealthWalletConsentEvent_eventType_idx" ON "HealthWalletConsentEvent"("eventType");

-- CreateIndex
CREATE INDEX "HealthWalletAccessLedger_workspaceId_patientId_idx" ON "HealthWalletAccessLedger"("workspaceId", "patientId");
CREATE INDEX "HealthWalletAccessLedger_patientId_timestamp_idx" ON "HealthWalletAccessLedger"("patientId", "timestamp" DESC);
CREATE INDEX "HealthWalletAccessLedger_consentId_idx" ON "HealthWalletAccessLedger"("consentId");
CREATE INDEX "HealthWalletAccessLedger_anomalyDetected_idx" ON "HealthWalletAccessLedger"("anomalyDetected");

-- CreateIndex
CREATE INDEX "HealthWalletDerivedData_workspaceId_patientId_idx" ON "HealthWalletDerivedData"("workspaceId", "patientId");
CREATE INDEX "HealthWalletDerivedData_derivedClass_idx" ON "HealthWalletDerivedData"("derivedClass");

-- CreateIndex
CREATE INDEX "HealthWalletProxy_workspaceId_patientId_idx" ON "HealthWalletProxy"("workspaceId", "patientId");
CREATE INDEX "HealthWalletProxy_proxyUserId_idx" ON "HealthWalletProxy"("proxyUserId");

-- CreateIndex
CREATE INDEX "HealthWalletResearchStudy_workspaceId_idx" ON "HealthWalletResearchStudy"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthWalletResearchConsent_workspaceId_patientId_studyId_key" ON "HealthWalletResearchConsent"("workspaceId", "patientId", "studyId");
CREATE INDEX "HealthWalletResearchConsent_patientId_idx" ON "HealthWalletResearchConsent"("patientId");

-- CreateIndex
CREATE INDEX "HealthWalletExport_workspaceId_patientId_idx" ON "HealthWalletExport"("workspaceId", "patientId");

-- CreateIndex
CREATE INDEX "HealthWalletCorrection_workspaceId_patientId_idx" ON "HealthWalletCorrection"("workspaceId", "patientId");
CREATE INDEX "HealthWalletCorrection_recordId_idx" ON "HealthWalletCorrection"("recordId");

-- CreateIndex
CREATE INDEX "HealthWalletRestriction_workspaceId_patientId_idx" ON "HealthWalletRestriction"("workspaceId", "patientId");

-- CreateIndex
CREATE INDEX "HealthWalletDeletionJob_workspaceId_patientId_idx" ON "HealthWalletDeletionJob"("workspaceId", "patientId");
CREATE INDEX "HealthWalletDeletionJob_asset_idx" ON "HealthWalletDeletionJob"("asset");
CREATE INDEX "HealthWalletDeletionJob_status_idx" ON "HealthWalletDeletionJob"("status");

-- AddForeignKey
ALTER TABLE "HealthWalletConsent" ADD CONSTRAINT "HealthWalletConsent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthWalletConsent" ADD CONSTRAINT "HealthWalletConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthWalletConsentEvent" ADD CONSTRAINT "HealthWalletConsentEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthWalletConsentEvent" ADD CONSTRAINT "HealthWalletConsentEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthWalletConsentEvent" ADD CONSTRAINT "HealthWalletConsentEvent_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "HealthWalletConsent"("consentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthWalletAccessLedger" ADD CONSTRAINT "HealthWalletAccessLedger_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthWalletAccessLedger" ADD CONSTRAINT "HealthWalletAccessLedger_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthWalletAccessLedger" ADD CONSTRAINT "HealthWalletAccessLedger_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "HealthWalletConsent"("consentId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthWalletDerivedData" ADD CONSTRAINT "HealthWalletDerivedData_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthWalletDerivedData" ADD CONSTRAINT "HealthWalletDerivedData_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthWalletProxy" ADD CONSTRAINT "HealthWalletProxy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthWalletProxy" ADD CONSTRAINT "HealthWalletProxy_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthWalletResearchStudy" ADD CONSTRAINT "HealthWalletResearchStudy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthWalletResearchConsent" ADD CONSTRAINT "HealthWalletResearchConsent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthWalletResearchConsent" ADD CONSTRAINT "HealthWalletResearchConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthWalletResearchConsent" ADD CONSTRAINT "HealthWalletResearchConsent_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "HealthWalletResearchStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthWalletExport" ADD CONSTRAINT "HealthWalletExport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthWalletExport" ADD CONSTRAINT "HealthWalletExport_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthWalletCorrection" ADD CONSTRAINT "HealthWalletCorrection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthWalletCorrection" ADD CONSTRAINT "HealthWalletCorrection_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthWalletRestriction" ADD CONSTRAINT "HealthWalletRestriction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthWalletRestriction" ADD CONSTRAINT "HealthWalletRestriction_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthWalletDeletionJob" ADD CONSTRAINT "HealthWalletDeletionJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthWalletDeletionJob" ADD CONSTRAINT "HealthWalletDeletionJob_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
