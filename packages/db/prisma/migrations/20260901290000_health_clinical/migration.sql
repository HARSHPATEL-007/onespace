-- N0VA Clinical — enterprise clinical systems edition.
-- Source-aware records, governed interop, stays, verified documentation,
-- medication/allergy safety, lab/imaging lifecycles, validated devices,
-- classified CDS/AI, living safety cases, change control, downtime, vendors.

-- CreateTable
CREATE TABLE "HealthClinicalRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "patientRef" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preliminary',
    "sourceSystem" TEXT NOT NULL DEFAULT '',
    "author" TEXT NOT NULL DEFAULT '',
    "effectiveTime" TIMESTAMP(3),
    "payload" JSONB NOT NULL DEFAULT '{}',
    "confidentiality" TEXT NOT NULL DEFAULT 'clinical',
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthClinicalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthClinicalInterop" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "partner" TEXT NOT NULL DEFAULT '',
    "direction" TEXT NOT NULL DEFAULT 'inbound',
    "kind" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT 'accepted',
    "incorporated" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthClinicalInterop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthClinicalEncounter" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "patientRef" TEXT NOT NULL,
    "setting" TEXT NOT NULL,
    "acuity" TEXT NOT NULL DEFAULT '',
    "stage" TEXT NOT NULL DEFAULT '',
    "tracking" JSONB NOT NULL DEFAULT '{}',
    "safety" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthClinicalEncounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthClinicalDocument" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "patientRef" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "aiDraft" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "signer" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthClinicalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthClinicalMedication" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "patientRef" TEXT NOT NULL,
    "medication" TEXT NOT NULL,
    "highAlert" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ordered',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthClinicalMedication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthClinicalResult" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "patientRef" TEXT NOT NULL,
    "domain" TEXT NOT NULL DEFAULT 'laboratory',
    "test" TEXT NOT NULL,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'preliminary_result',
    "owner" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthClinicalResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthClinicalImaging" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "patientRef" TEXT NOT NULL,
    "modality" TEXT NOT NULL,
    "aiAnalysis" BOOLEAN NOT NULL DEFAULT false,
    "regulatoryClass" TEXT NOT NULL DEFAULT '',
    "separation" TEXT[] NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthClinicalImaging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthClinicalDevice" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "identifier" TEXT NOT NULL DEFAULT '',
    "manufacturer" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "firmware" TEXT NOT NULL DEFAULT '',
    "intendedUse" TEXT NOT NULL DEFAULT '',
    "site" TEXT NOT NULL DEFAULT '',
    "patientAssociation" TEXT NOT NULL DEFAULT '',
    "reliability" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'registered',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthClinicalDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthClinicalCds" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "cdsId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cdsClass" TEXT NOT NULL,
    "intendedUser" TEXT NOT NULL DEFAULT '',
    "intendedUse" TEXT NOT NULL DEFAULT '',
    "inputs" TEXT[] NOT NULL DEFAULT '{}',
    "evidence" TEXT[] NOT NULL DEFAULT '{}',
    "regulatoryClass" TEXT NOT NULL DEFAULT 'under_review',
    "humanReview" TEXT NOT NULL DEFAULT 'required',
    "transparency" TEXT[] NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthClinicalCds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthClinicalAi" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "owner" TEXT NOT NULL DEFAULT '',
    "intendedUse" TEXT NOT NULL DEFAULT '',
    "population" TEXT NOT NULL DEFAULT '',
    "sites" TEXT[] NOT NULL DEFAULT '{}',
    "regulatoryClass" TEXT NOT NULL DEFAULT 'under_review',
    "status" TEXT NOT NULL DEFAULT 'registered',
    "monitors" TEXT[] NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthClinicalAi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthClinicalSafety" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "capability" TEXT NOT NULL DEFAULT '',
    "claim" TEXT NOT NULL DEFAULT '',
    "hazards" TEXT[] NOT NULL DEFAULT '{}',
    "controls" TEXT[] NOT NULL DEFAULT '{}',
    "evidence" TEXT[] NOT NULL DEFAULT '{}',
    "residualRisk" TEXT NOT NULL DEFAULT '',
    "monitoring" TEXT[] NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthClinicalSafety_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthClinicalChange" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "changeId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '',
    "rationale" TEXT NOT NULL DEFAULT '',
    "riskClass" TEXT NOT NULL DEFAULT '',
    "rollback" TEXT NOT NULL DEFAULT '',
    "owner" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "emergencyBypass" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthClinicalChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthClinicalDowntime" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "downtimeId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "commander" TEXT NOT NULL DEFAULT '',
    "phase" TEXT NOT NULL DEFAULT 'before',
    "reconciled" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthClinicalDowntime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthClinicalQuality" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "dashboard" TEXT NOT NULL,
    "finding" TEXT NOT NULL DEFAULT '',
    "owner" TEXT NOT NULL DEFAULT '',
    "dueDate" TIMESTAMP(3),
    "cycle" TEXT[] NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'signal',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthClinicalQuality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthClinicalVendor" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assessment" JSONB NOT NULL DEFAULT '{}',
    "triggersRevalidation" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthClinicalVendor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthClinicalRecord_workspaceId_itemId_key" ON "HealthClinicalRecord"("workspaceId", "itemId");
CREATE INDEX "HealthClinicalRecord_workspaceId_patientRef_idx" ON "HealthClinicalRecord"("workspaceId", "patientRef");

-- CreateIndex
CREATE UNIQUE INDEX "HealthClinicalInterop_workspaceId_transactionId_key" ON "HealthClinicalInterop"("workspaceId", "transactionId");
CREATE INDEX "HealthClinicalInterop_workspaceId_partner_idx" ON "HealthClinicalInterop"("workspaceId", "partner");

-- CreateIndex
CREATE UNIQUE INDEX "HealthClinicalEncounter_workspaceId_stayId_key" ON "HealthClinicalEncounter"("workspaceId", "stayId");
CREATE INDEX "HealthClinicalEncounter_workspaceId_patientRef_idx" ON "HealthClinicalEncounter"("workspaceId", "patientRef");

-- CreateIndex
CREATE UNIQUE INDEX "HealthClinicalDocument_workspaceId_documentId_key" ON "HealthClinicalDocument"("workspaceId", "documentId");
CREATE INDEX "HealthClinicalDocument_workspaceId_patientRef_idx" ON "HealthClinicalDocument"("workspaceId", "patientRef");

-- CreateIndex
CREATE UNIQUE INDEX "HealthClinicalMedication_workspaceId_orderId_key" ON "HealthClinicalMedication"("workspaceId", "orderId");
CREATE INDEX "HealthClinicalMedication_workspaceId_patientRef_idx" ON "HealthClinicalMedication"("workspaceId", "patientRef");

-- CreateIndex
CREATE UNIQUE INDEX "HealthClinicalResult_workspaceId_resultId_key" ON "HealthClinicalResult"("workspaceId", "resultId");
CREATE INDEX "HealthClinicalResult_workspaceId_patientRef_idx" ON "HealthClinicalResult"("workspaceId", "patientRef");

-- CreateIndex
CREATE UNIQUE INDEX "HealthClinicalImaging_workspaceId_studyId_key" ON "HealthClinicalImaging"("workspaceId", "studyId");
CREATE INDEX "HealthClinicalImaging_workspaceId_patientRef_idx" ON "HealthClinicalImaging"("workspaceId", "patientRef");

-- CreateIndex
CREATE UNIQUE INDEX "HealthClinicalDevice_workspaceId_deviceId_key" ON "HealthClinicalDevice"("workspaceId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthClinicalCds_workspaceId_cdsId_key" ON "HealthClinicalCds"("workspaceId", "cdsId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthClinicalAi_workspaceId_modelId_key" ON "HealthClinicalAi"("workspaceId", "modelId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthClinicalSafety_workspaceId_caseId_key" ON "HealthClinicalSafety"("workspaceId", "caseId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthClinicalChange_workspaceId_changeId_key" ON "HealthClinicalChange"("workspaceId", "changeId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthClinicalDowntime_workspaceId_downtimeId_key" ON "HealthClinicalDowntime"("workspaceId", "downtimeId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthClinicalQuality_workspaceId_signalId_key" ON "HealthClinicalQuality"("workspaceId", "signalId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthClinicalVendor_workspaceId_vendorId_key" ON "HealthClinicalVendor"("workspaceId", "vendorId");

-- AddForeignKey
ALTER TABLE "HealthClinicalRecord" ADD CONSTRAINT "HealthClinicalRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthClinicalInterop" ADD CONSTRAINT "HealthClinicalInterop_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthClinicalEncounter" ADD CONSTRAINT "HealthClinicalEncounter_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthClinicalDocument" ADD CONSTRAINT "HealthClinicalDocument_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthClinicalMedication" ADD CONSTRAINT "HealthClinicalMedication_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthClinicalResult" ADD CONSTRAINT "HealthClinicalResult_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthClinicalImaging" ADD CONSTRAINT "HealthClinicalImaging_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthClinicalDevice" ADD CONSTRAINT "HealthClinicalDevice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthClinicalCds" ADD CONSTRAINT "HealthClinicalCds_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthClinicalAi" ADD CONSTRAINT "HealthClinicalAi_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthClinicalSafety" ADD CONSTRAINT "HealthClinicalSafety_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthClinicalChange" ADD CONSTRAINT "HealthClinicalChange_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthClinicalDowntime" ADD CONSTRAINT "HealthClinicalDowntime_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthClinicalQuality" ADD CONSTRAINT "HealthClinicalQuality_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthClinicalVendor" ADD CONSTRAINT "HealthClinicalVendor_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
