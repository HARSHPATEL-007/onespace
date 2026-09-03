-- N0VA Research — controlled research, trial, biobanking, and evidence
-- environment. Protocols version on amendment, datasets carry documented
-- risk classification, access auto-expires, trials lock, analyses version,
-- closeout preserves regulatory and reproducibility records.

-- CreateTable
CREATE TABLE "HealthResearchProtocol" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "title" TEXT NOT NULL,
    "principalInvestigator" TEXT NOT NULL DEFAULT '',
    "sponsor" TEXT NOT NULL DEFAULT '',
    "institution" TEXT NOT NULL DEFAULT '',
    "studyType" TEXT NOT NULL DEFAULT 'real_world_evidence',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "inclusion" TEXT[] NOT NULL DEFAULT '{}',
    "exclusion" TEXT[] NOT NULL DEFAULT '{}',
    "dataDomains" TEXT[] NOT NULL DEFAULT '{}',
    "consentModel" TEXT NOT NULL DEFAULT '',
    "irbStatus" TEXT NOT NULL DEFAULT 'pending',
    "dataAccess" TEXT NOT NULL DEFAULT 'controlled',
    "geography" TEXT NOT NULL DEFAULT '',
    "analysisPlan" TEXT NOT NULL DEFAULT '',
    "approvedOutputs" TEXT[] NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthResearchProtocol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthResearchDataset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "classification" TEXT NOT NULL DEFAULT 'R2',
    "deidReport" JSONB NOT NULL DEFAULT '{}',
    "quality" JSONB NOT NULL DEFAULT '{}',
    "protocolId" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthResearchDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthResearchAccess" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accessId" TEXT NOT NULL,
    "investigator" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'principal_investigator',
    "institution" TEXT NOT NULL DEFAULT '',
    "protocolId" TEXT NOT NULL DEFAULT '',
    "datasetId" TEXT NOT NULL DEFAULT '',
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "region" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthResearchAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthResearchCohort" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL DEFAULT '',
    "logic" TEXT NOT NULL DEFAULT '',
    "inclusion" INTEGER NOT NULL DEFAULT 0,
    "exclusion" INTEGER NOT NULL DEFAULT 0,
    "missingness" JSONB NOT NULL DEFAULT '{}',
    "reviewer" TEXT NOT NULL DEFAULT '',
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthResearchCohort_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthResearchTrial" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "trialId" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "sites" TEXT[] NOT NULL DEFAULT '{}',
    "participants" JSONB NOT NULL DEFAULT '[]',
    "adverseEvents" JSONB NOT NULL DEFAULT '[]',
    "deviations" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'setup',
    "dataLock" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthResearchTrial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthResearchBiobank" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "specimenId" TEXT NOT NULL,
    "participantRef" TEXT NOT NULL DEFAULT '',
    "specimenType" TEXT NOT NULL,
    "site" TEXT NOT NULL DEFAULT '',
    "consentRef" TEXT NOT NULL DEFAULT '',
    "custody" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'stored',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthResearchBiobank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthResearchAnalysis" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL DEFAULT '',
    "datasetId" TEXT NOT NULL DEFAULT '',
    "plan" JSONB NOT NULL DEFAULT '{}',
    "codeRef" TEXT NOT NULL DEFAULT '',
    "outputKind" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "reproPackage" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'registered',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthResearchAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthResearchPublication" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL DEFAULT '',
    "analysisId" TEXT NOT NULL DEFAULT '',
    "draftRef" TEXT NOT NULL DEFAULT '',
    "checks" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "pipeline" TEXT[] NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthResearchPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthResearchProject" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL DEFAULT '',
    "stage" TEXT NOT NULL DEFAULT 'concept',
    "closeout" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthResearchProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthResearchProtocol_workspaceId_protocolId_version_key" ON "HealthResearchProtocol"("workspaceId", "protocolId", "version");
CREATE INDEX "HealthResearchProtocol_workspaceId_status_idx" ON "HealthResearchProtocol"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HealthResearchDataset_workspaceId_datasetId_key" ON "HealthResearchDataset"("workspaceId", "datasetId");
CREATE INDEX "HealthResearchDataset_workspaceId_protocolId_idx" ON "HealthResearchDataset"("workspaceId", "protocolId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthResearchAccess_workspaceId_accessId_key" ON "HealthResearchAccess"("workspaceId", "accessId");
CREATE INDEX "HealthResearchAccess_workspaceId_protocolId_idx" ON "HealthResearchAccess"("workspaceId", "protocolId");
CREATE INDEX "HealthResearchAccess_workspaceId_status_idx" ON "HealthResearchAccess"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HealthResearchCohort_workspaceId_cohortId_key" ON "HealthResearchCohort"("workspaceId", "cohortId");
CREATE INDEX "HealthResearchCohort_workspaceId_protocolId_idx" ON "HealthResearchCohort"("workspaceId", "protocolId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthResearchTrial_workspaceId_trialId_key" ON "HealthResearchTrial"("workspaceId", "trialId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthResearchBiobank_workspaceId_specimenId_key" ON "HealthResearchBiobank"("workspaceId", "specimenId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthResearchAnalysis_workspaceId_analysisId_key" ON "HealthResearchAnalysis"("workspaceId", "analysisId");
CREATE INDEX "HealthResearchAnalysis_workspaceId_protocolId_idx" ON "HealthResearchAnalysis"("workspaceId", "protocolId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthResearchPublication_workspaceId_publicationId_key" ON "HealthResearchPublication"("workspaceId", "publicationId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthResearchProject_workspaceId_projectId_key" ON "HealthResearchProject"("workspaceId", "projectId");

-- AddForeignKey
ALTER TABLE "HealthResearchProtocol" ADD CONSTRAINT "HealthResearchProtocol_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthResearchDataset" ADD CONSTRAINT "HealthResearchDataset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthResearchAccess" ADD CONSTRAINT "HealthResearchAccess_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthResearchCohort" ADD CONSTRAINT "HealthResearchCohort_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthResearchTrial" ADD CONSTRAINT "HealthResearchTrial_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthResearchBiobank" ADD CONSTRAINT "HealthResearchBiobank_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthResearchAnalysis" ADD CONSTRAINT "HealthResearchAnalysis_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthResearchPublication" ADD CONSTRAINT "HealthResearchPublication_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthResearchProject" ADD CONSTRAINT "HealthResearchProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
