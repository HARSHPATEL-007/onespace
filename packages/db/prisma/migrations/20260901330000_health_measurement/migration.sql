-- N0VA HEALTH measurement framework — outcome readings with numerator,
-- denominator, stratum, and uncertainty; claim reviews with evidence gate.
CREATE TABLE "HealthOutcomeMeasurement" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "measurementId" TEXT NOT NULL,
    "measureId" TEXT NOT NULL,
    "edition" TEXT NOT NULL DEFAULT '',
    "numerator" DOUBLE PRECISION,
    "denominator" DOUBLE PRECISION,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "stratum" JSONB NOT NULL DEFAULT '{}',
    "riskAdjusted" BOOLEAN NOT NULL DEFAULT false,
    "ciLower" DOUBLE PRECISION,
    "ciUpper" DOUBLE PRECISION,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "dataCompleteness" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "caveats" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthOutcomeMeasurement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HealthOutcomeMeasurement_workspaceId_measurementId_key" ON "HealthOutcomeMeasurement"("workspaceId", "measurementId");
CREATE INDEX "HealthOutcomeMeasurement_workspaceId_measureId_idx" ON "HealthOutcomeMeasurement"("workspaceId", "measureId");

CREATE TABLE "HealthClaimReview" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "claimText" TEXT NOT NULL,
    "context" TEXT NOT NULL DEFAULT '',
    "validationProtocol" TEXT NOT NULL DEFAULT '',
    "population" TEXT NOT NULL DEFAULT '',
    "comparator" TEXT NOT NULL DEFAULT '',
    "confidenceInterval" TEXT NOT NULL DEFAULT '',
    "regulatoryStatus" TEXT NOT NULL DEFAULT '',
    "permitted" BOOLEAN NOT NULL DEFAULT false,
    "flags" TEXT[] NOT NULL DEFAULT '{}',
    "reviewer" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthClaimReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HealthClaimReview_workspaceId_claimId_key" ON "HealthClaimReview"("workspaceId", "claimId");
CREATE INDEX "HealthClaimReview_workspaceId_permitted_idx" ON "HealthClaimReview"("workspaceId", "permitted");

ALTER TABLE "HealthOutcomeMeasurement" ADD CONSTRAINT "HealthOutcomeMeasurement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthClaimReview" ADD CONSTRAINT "HealthClaimReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
