-- N0VA Personal — consumer-controlled health and wellness companion.
-- User-owned records with provenance, reminder-only medications, guarded
-- appointments, labeled device data, bounded Ani, granular sharing.

-- CreateTable
CREATE TABLE "HealthPersonalProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profile" JSONB NOT NULL DEFAULT '{}',
    "emergencySummary" JSONB NOT NULL DEFAULT '{}',
    "privacySettings" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPersonalProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPersonalGoal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "adaptations" TEXT[] NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPersonalGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPersonalMedication" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dosage" TEXT NOT NULL DEFAULT '',
    "schedule" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT 'user_entered',
    "prescriber" TEXT NOT NULL DEFAULT '',
    "pharmacy" TEXT NOT NULL DEFAULT '',
    "photoRef" TEXT NOT NULL DEFAULT '',
    "doseLog" JSONB NOT NULL DEFAULT '[]',
    "sideEffects" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPersonalMedication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPersonalAppointment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "criticality" TEXT NOT NULL DEFAULT 'routine',
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "preparation" TEXT[] NOT NULL DEFAULT '{}',
    "transportNotes" TEXT NOT NULL DEFAULT '',
    "accessibilityNeeds" TEXT[] NOT NULL DEFAULT '{}',
    "caregiverAttending" TEXT NOT NULL DEFAULT '',
    "telehealthReady" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPersonalAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPersonalDocument" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'patient_upload',
    "recordedAt" TIMESTAMP(3),
    "clinicianAuthored" BOOLEAN NOT NULL DEFAULT false,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "currentlyValid" BOOLEAN NOT NULL DEFAULT true,
    "viewers" TEXT[] NOT NULL DEFAULT '{}',
    "storageRef" TEXT NOT NULL DEFAULT '',
    "accessHistory" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthPersonalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPersonalDevice" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "firmware" TEXT NOT NULL DEFAULT '',
    "calibrationStatus" TEXT NOT NULL DEFAULT 'unknown',
    "connectivity" TEXT NOT NULL DEFAULT 'unknown',
    "readings" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPersonalDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPersonalJournal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "severity" INTEGER,
    "correctsId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthPersonalJournal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPersonalSharing" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "categories" TEXT[] NOT NULL DEFAULT '{}',
    "recipient" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "oneTime" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "scope" JSONB NOT NULL DEFAULT '{}',
    "accessHistory" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPersonalSharing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPersonalTimeline" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "marker" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "refId" TEXT NOT NULL DEFAULT '',
    "conflictWith" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthPersonalTimeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPersonalAni" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "state" TEXT NOT NULL DEFAULT 'general_wellness',
    "reviewer" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPersonalAni_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthPersonalProfile_workspaceId_userId_key" ON "HealthPersonalProfile"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPersonalGoal_workspaceId_goalId_key" ON "HealthPersonalGoal"("workspaceId", "goalId");
CREATE INDEX "HealthPersonalGoal_workspaceId_userId_idx" ON "HealthPersonalGoal"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPersonalMedication_workspaceId_medicationId_key" ON "HealthPersonalMedication"("workspaceId", "medicationId");
CREATE INDEX "HealthPersonalMedication_workspaceId_userId_idx" ON "HealthPersonalMedication"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPersonalAppointment_workspaceId_appointmentId_key" ON "HealthPersonalAppointment"("workspaceId", "appointmentId");
CREATE INDEX "HealthPersonalAppointment_workspaceId_userId_idx" ON "HealthPersonalAppointment"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPersonalDocument_workspaceId_documentId_key" ON "HealthPersonalDocument"("workspaceId", "documentId");
CREATE INDEX "HealthPersonalDocument_workspaceId_userId_idx" ON "HealthPersonalDocument"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPersonalDevice_workspaceId_deviceId_key" ON "HealthPersonalDevice"("workspaceId", "deviceId");
CREATE INDEX "HealthPersonalDevice_workspaceId_userId_idx" ON "HealthPersonalDevice"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPersonalJournal_workspaceId_entryId_key" ON "HealthPersonalJournal"("workspaceId", "entryId");
CREATE INDEX "HealthPersonalJournal_workspaceId_userId_idx" ON "HealthPersonalJournal"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPersonalSharing_workspaceId_shareId_key" ON "HealthPersonalSharing"("workspaceId", "shareId");
CREATE INDEX "HealthPersonalSharing_workspaceId_userId_idx" ON "HealthPersonalSharing"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPersonalTimeline_workspaceId_eventId_key" ON "HealthPersonalTimeline"("workspaceId", "eventId");
CREATE INDEX "HealthPersonalTimeline_workspaceId_userId_idx" ON "HealthPersonalTimeline"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPersonalAni_workspaceId_sessionId_key" ON "HealthPersonalAni"("workspaceId", "sessionId");
CREATE INDEX "HealthPersonalAni_workspaceId_userId_idx" ON "HealthPersonalAni"("workspaceId", "userId");

-- AddForeignKey
ALTER TABLE "HealthPersonalProfile" ADD CONSTRAINT "HealthPersonalProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPersonalGoal" ADD CONSTRAINT "HealthPersonalGoal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPersonalMedication" ADD CONSTRAINT "HealthPersonalMedication_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPersonalAppointment" ADD CONSTRAINT "HealthPersonalAppointment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPersonalDocument" ADD CONSTRAINT "HealthPersonalDocument_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPersonalDevice" ADD CONSTRAINT "HealthPersonalDevice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPersonalJournal" ADD CONSTRAINT "HealthPersonalJournal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPersonalSharing" ADD CONSTRAINT "HealthPersonalSharing_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPersonalTimeline" ADD CONSTRAINT "HealthPersonalTimeline_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPersonalAni" ADD CONSTRAINT "HealthPersonalAni_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
