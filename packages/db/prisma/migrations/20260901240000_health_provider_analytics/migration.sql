-- N0VA Provider and Organization Intelligence Plane — versioned metric
-- definitions with display context, observations, improvement action queues,
-- model safety readings, and equity reviews. Unadjusted outcomes never rank alone.

-- CreateTable
CREATE TABLE "HealthProviderMetric" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "definition" TEXT NOT NULL DEFAULT '',
    "population" TEXT NOT NULL DEFAULT '',
    "numerator" TEXT NOT NULL DEFAULT '',
    "denominator" TEXT NOT NULL DEFAULT '',
    "aggregation" TEXT NOT NULL DEFAULT 'rate',
    "attribution" TEXT NOT NULL DEFAULT '',
    "exclusions" TEXT[] NOT NULL DEFAULT '{}',
    "stratifications" TEXT[] NOT NULL DEFAULT '{}',
    "refresh" TEXT NOT NULL DEFAULT 'daily',
    "owner" TEXT NOT NULL DEFAULT '',
    "actionOwner" TEXT NOT NULL DEFAULT '',
    "version" TEXT NOT NULL DEFAULT '1.0',
    "qualityStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "observationPeriod" TEXT NOT NULL DEFAULT '',
    "dataSources" TEXT[] NOT NULL DEFAULT '{}',
    "dataCompleteness" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "riskAdjustmentMethod" TEXT NOT NULL DEFAULT 'unadjusted',
    "comparisonBaseline" TEXT NOT NULL DEFAULT '',
    "suppressionRule" TEXT NOT NULL DEFAULT 'suppress_under_11',
    "caveats" TEXT[] NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthProviderMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthProviderObservation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "numerator" INTEGER NOT NULL DEFAULT 0,
    "denominator" INTEGER NOT NULL DEFAULT 0,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stratum" JSONB NOT NULL DEFAULT '{}',
    "riskAdjusted" DOUBLE PRECISION,
    "ciLower" DOUBLE PRECISION,
    "ciUpper" DOUBLE PRECISION,
    "quality" JSONB NOT NULL DEFAULT '{}',
    "attribution" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthProviderObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthProviderActionQueue" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "owner" TEXT NOT NULL DEFAULT '',
    "populationRef" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "flow" TEXT[] NOT NULL DEFAULT '{}',
    "disposition" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthProviderActionQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthProviderModel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "owner" TEXT NOT NULL DEFAULT '',
    "intendedUse" TEXT NOT NULL DEFAULT '',
    "prohibitedUse" TEXT[] NOT NULL DEFAULT '{}',
    "population" TEXT NOT NULL DEFAULT '',
    "dataSources" TEXT[] NOT NULL DEFAULT '{}',
    "trainingPeriod" TEXT NOT NULL DEFAULT '',
    "deploymentSites" TEXT[] NOT NULL DEFAULT '{}',
    "clinicalWorkflow" TEXT NOT NULL DEFAULT '',
    "humanDecisionMaker" TEXT NOT NULL DEFAULT '',
    "riskClassification" TEXT NOT NULL DEFAULT '',
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "reviewDate" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthProviderModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthProviderModelReading" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "readingId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "calibrationError" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subgroupGap" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "harmSignals" INTEGER NOT NULL DEFAULT 0,
    "unreviewedOutputRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discrimination" DOUBLE PRECISION,
    "overrideRate" DOUBLE PRECISION,
    "drift" JSONB NOT NULL DEFAULT '{}',
    "gateAction" TEXT NOT NULL DEFAULT 'operate',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthProviderModelReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthProviderEquityReview" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "disparity" TEXT NOT NULL,
    "stratifiers" TEXT[] NOT NULL DEFAULT '{}',
    "gaps" JSONB NOT NULL DEFAULT '{}',
    "stage" TEXT NOT NULL DEFAULT 'observed_disparity',
    "owner" TEXT NOT NULL DEFAULT '',
    "intervention" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthProviderEquityReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthProviderMetric_workspaceId_metricId_key" ON "HealthProviderMetric"("workspaceId", "metricId");
CREATE INDEX "HealthProviderMetric_workspaceId_qualityStatus_idx" ON "HealthProviderMetric"("workspaceId", "qualityStatus");

-- CreateIndex
CREATE UNIQUE INDEX "HealthProviderObservation_workspaceId_observationId_key" ON "HealthProviderObservation"("workspaceId", "observationId");
CREATE INDEX "HealthProviderObservation_workspaceId_metricId_idx" ON "HealthProviderObservation"("workspaceId", "metricId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthProviderActionQueue_workspaceId_queueId_key" ON "HealthProviderActionQueue"("workspaceId", "queueId");
CREATE INDEX "HealthProviderActionQueue_workspaceId_status_idx" ON "HealthProviderActionQueue"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HealthProviderModel_workspaceId_modelId_key" ON "HealthProviderModel"("workspaceId", "modelId");
CREATE INDEX "HealthProviderModel_workspaceId_approvalStatus_idx" ON "HealthProviderModel"("workspaceId", "approvalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "HealthProviderModelReading_workspaceId_readingId_key" ON "HealthProviderModelReading"("workspaceId", "readingId");
CREATE INDEX "HealthProviderModelReading_workspaceId_modelId_idx" ON "HealthProviderModelReading"("workspaceId", "modelId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthProviderEquityReview_workspaceId_reviewId_key" ON "HealthProviderEquityReview"("workspaceId", "reviewId");
CREATE INDEX "HealthProviderEquityReview_workspaceId_stage_idx" ON "HealthProviderEquityReview"("workspaceId", "stage");

-- AddForeignKey
ALTER TABLE "HealthProviderMetric" ADD CONSTRAINT "HealthProviderMetric_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthProviderObservation" ADD CONSTRAINT "HealthProviderObservation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthProviderActionQueue" ADD CONSTRAINT "HealthProviderActionQueue_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthProviderModel" ADD CONSTRAINT "HealthProviderModel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthProviderModelReading" ADD CONSTRAINT "HealthProviderModelReading_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthProviderEquityReview" ADD CONSTRAINT "HealthProviderEquityReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
