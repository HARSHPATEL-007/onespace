-- Consent-Aware Care Coordination Network — FHIR CareTeam, RelatedPerson, Consent
-- Least-privilege delegation, 3 visibility layers, warm handoffs, shared timeline, caregiver wellbeing

-- CreateEnum
CREATE TYPE "CaregiverRelationship" AS ENUM ('FAMILY_MEMBER', 'INFORMAL_CAREGIVER', 'PARENT', 'LEGAL_GUARDIAN', 'HEALTH_CARE_PROXY', 'POWER_OF_ATTORNEY_HOLDER', 'TRUSTED_CONTACT', 'HOME_HEALTH_NURSE', 'COMMUNITY_HEALTH_WORKER', 'TRANSPORT_PROVIDER', 'PHARMACIST', 'SPECIALIST', 'PRIMARY_CARE_CLINICIAN', 'EMERGENCY_RESPONDER', 'RESEARCH_COORDINATOR', 'SOCIAL_CARE_WORKER');

-- CreateEnum
CREATE TYPE "CaregiverPermission" AS ENUM ('VIEW', 'ADD_PATIENT_REPORTED_INFORMATION', 'CONFIRM_MEDICATION_ADMINISTRATION', 'REQUEST_REFILL', 'SCHEDULE_APPOINTMENT', 'RESCHEDULE_APPOINTMENT', 'ARRANGE_TRANSPORT', 'VIEW_PREPARATION_INSTRUCTIONS', 'VIEW_RESULTS', 'VIEW_MEDICATION_LIST', 'SEND_MESSAGES', 'RECEIVE_ALERTS', 'COMPLETE_CARE_TASKS', 'APPROVE_RESEARCH_PARTICIPATION', 'DOWNLOAD_RECORDS', 'MODIFY_CONSENT', 'ACT_DURING_INCAPACITY', 'USE_EMERGENCY_ACCESS');

-- CreateEnum
CREATE TYPE "DelegationStatus" AS ENUM ('REQUESTED', 'PATIENT_REVIEWED', 'VERIFIED', 'APPROVED', 'ACTIVE', 'EXPIRING_SOON', 'PAUSED', 'REVOKED', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CarePlanVisibility" AS ENUM ('SHARED', 'ROLE_SPECIFIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "CareTaskStatus" AS ENUM ('PLANNED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED', 'REASSIGNED', 'SNOOZED', 'MISSED', 'BLOCKED', 'ESCALATED', 'CANCELLED', 'REQUIRES_CLINICAL_REVIEW');

-- CreateEnum
CREATE TYPE "MedicationTaskStatus" AS ENUM ('PRESCRIBED', 'RECONCILED', 'PATIENT_CONFIRMED', 'CAREGIVER_NOTIFIED', 'DOSE_SCHEDULED', 'DOSE_ADMINISTERED_OR_SELF_REPORTED', 'MISSED_REFUSED_UNKNOWN', 'FOLLOW_UP_ACTION', 'CLINICIAN_REVIEW_IF_REQUIRED');

-- CreateEnum
CREATE TYPE "TransportStatus" AS ENUM ('TRANSPORT_NEEDED', 'REQUEST_CREATED', 'DRIVER_OR_SERVICE_ASSIGNED', 'PICKUP_CONFIRMED', 'PATIENT_EN_ROUTE', 'ARRIVED', 'APPOINTMENT_COMPLETED', 'RETURN_TRANSPORT_CONFIRMED');

-- CreateTable
CREATE TABLE "HealthCareTeam" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Care Team',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCareTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCareTeamMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "careTeamId" TEXT,
    "relatedPersonId" TEXT,
    "userId" TEXT,
    "relationship" "CaregiverRelationship" NOT NULL,
    "role" TEXT,
    "permissions" "CaregiverPermission"[] DEFAULT ARRAY[]::"CaregiverPermission"[],
    "dataCategories" "WalletDataDomain"[] DEFAULT ARRAY[]::"WalletDataDomain"[],
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCareTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthDelegation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "delegateId" TEXT,
    "delegateEmail" TEXT,
    "delegateName" TEXT,
    "relationship" "CaregiverRelationship" NOT NULL,
    "authorizedTasks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dataCategories" "WalletDataDomain"[] DEFAULT ARRAY[]::"WalletDataDomain"[],
    "purpose" TEXT,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "geography" TEXT,
    "language" TEXT,
    "communicationChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "emergencyPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "conditions" TEXT,
    "patientNotificationPreference" TEXT,
    "legalDocumentReference" TEXT,
    "reviewDate" TIMESTAMP(3),
    "revocationMethod" TEXT,
    "status" "DelegationStatus" NOT NULL DEFAULT 'REQUESTED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthDelegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthSharedCarePlan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "careTeamId" TEXT,
    "title" TEXT NOT NULL,
    "goal" TEXT,
    "objective" TEXT,
    "sharedSection" JSONB NOT NULL DEFAULT '{}',
    "roleSpecificSection" JSONB NOT NULL DEFAULT '{}',
    "privateSection" JSONB NOT NULL DEFAULT '{}',
    "visibility" "CarePlanVisibility" NOT NULL DEFAULT 'SHARED',
    "consentRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthSharedCarePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCareTask" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT,
    "careTeamId" TEXT,
    "sharedCarePlanId" TEXT,
    "title" TEXT NOT NULL,
    "patientGoal" TEXT,
    "ownerId" TEXT,
    "backupOwnerId" TEXT,
    "sourceCarePlanId" TEXT,
    "dueAt" TIMESTAMP(3),
    "location" TEXT,
    "requiredEquipment" TEXT,
    "instructions" TEXT,
    "accessibilityNeeds" TEXT,
    "consentScope" TEXT,
    "evidenceOfCompletion" TEXT,
    "escalationRule" JSONB NOT NULL DEFAULT '{}',
    "completionNote" TEXT,
    "auditHistory" JSONB NOT NULL DEFAULT '[]',
    "status" "CareTaskStatus" NOT NULL DEFAULT 'PLANNED',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "patientVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCareTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthEscalationTree" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT,
    "event" TEXT NOT NULL,
    "trigger" JSONB NOT NULL DEFAULT '{}',
    "tree" JSONB NOT NULL DEFAULT '[]',
    "stopConditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthEscalationTree_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCaregiverWellbeing" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "caregiverId" TEXT NOT NULL,
    "patientId" TEXT,
    "tasksAssigned" INTEGER NOT NULL DEFAULT 0,
    "tasksCompleted" INTEGER NOT NULL DEFAULT 0,
    "tasksMissed" INTEGER NOT NULL DEFAULT 0,
    "avgTaskTimeMin" DOUBLE PRECISION,
    "nightInterruptions" INTEGER NOT NULL DEFAULT 0,
    "travelBurdenMin" INTEGER,
    "patientsSupported" INTEGER NOT NULL DEFAULT 1,
    "medicationComplexity" TEXT,
    "checkInResponse" JSONB NOT NULL DEFAULT '{}',
    "capacity" TEXT,
    "zaritScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCaregiverWellbeing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HealthCareTeam_workspaceId_patientId_idx" ON "HealthCareTeam"("workspaceId", "patientId");

-- CreateIndex
CREATE INDEX "HealthCareTeamMember_workspaceId_patientId_idx" ON "HealthCareTeamMember"("workspaceId", "patientId");
CREATE INDEX "HealthCareTeamMember_careTeamId_idx" ON "HealthCareTeamMember"("careTeamId");

-- CreateIndex
CREATE INDEX "HealthDelegation_workspaceId_patientId_idx" ON "HealthDelegation"("workspaceId", "patientId");
CREATE INDEX "HealthDelegation_status_idx" ON "HealthDelegation"("status");
CREATE INDEX "HealthDelegation_delegateId_idx" ON "HealthDelegation"("delegateId");

-- CreateIndex
CREATE INDEX "HealthSharedCarePlan_workspaceId_patientId_idx" ON "HealthSharedCarePlan"("workspaceId", "patientId");
CREATE INDEX "HealthSharedCarePlan_careTeamId_idx" ON "HealthSharedCarePlan"("careTeamId");

-- CreateIndex
CREATE INDEX "HealthCareTask_workspaceId_patientId_idx" ON "HealthCareTask"("workspaceId", "patientId");
CREATE INDEX "HealthCareTask_careTeamId_idx" ON "HealthCareTask"("careTeamId");
CREATE INDEX "HealthCareTask_status_idx" ON "HealthCareTask"("status");
CREATE INDEX "HealthCareTask_dueAt_idx" ON "HealthCareTask"("dueAt");

-- CreateIndex
CREATE INDEX "HealthEscalationTree_workspaceId_patientId_idx" ON "HealthEscalationTree"("workspaceId", "patientId");
CREATE INDEX "HealthEscalationTree_event_idx" ON "HealthEscalationTree"("event");

-- CreateIndex
CREATE INDEX "HealthCaregiverWellbeing_workspaceId_caregiverId_idx" ON "HealthCaregiverWellbeing"("workspaceId", "caregiverId");
CREATE INDEX "HealthCaregiverWellbeing_patientId_idx" ON "HealthCaregiverWellbeing"("patientId");

-- AddForeignKey
ALTER TABLE "HealthCareTeam" ADD CONSTRAINT "HealthCareTeam_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthCareTeam" ADD CONSTRAINT "HealthCareTeam_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCareTeamMember" ADD CONSTRAINT "HealthCareTeamMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthCareTeamMember" ADD CONSTRAINT "HealthCareTeamMember_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthCareTeamMember" ADD CONSTRAINT "HealthCareTeamMember_careTeamId_fkey" FOREIGN KEY ("careTeamId") REFERENCES "HealthCareTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthCareTeamMember" ADD CONSTRAINT "HealthCareTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthDelegation" ADD CONSTRAINT "HealthDelegation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthDelegation" ADD CONSTRAINT "HealthDelegation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthSharedCarePlan" ADD CONSTRAINT "HealthSharedCarePlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthSharedCarePlan" ADD CONSTRAINT "HealthSharedCarePlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthSharedCarePlan" ADD CONSTRAINT "HealthSharedCarePlan_careTeamId_fkey" FOREIGN KEY ("careTeamId") REFERENCES "HealthCareTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCareTask" ADD CONSTRAINT "HealthCareTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthCareTask" ADD CONSTRAINT "HealthCareTask_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthCareTask" ADD CONSTRAINT "HealthCareTask_careTeamId_fkey" FOREIGN KEY ("careTeamId") REFERENCES "HealthCareTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HealthCareTask" ADD CONSTRAINT "HealthCareTask_sharedCarePlanId_fkey" FOREIGN KEY ("sharedCarePlanId") REFERENCES "HealthSharedCarePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthEscalationTree" ADD CONSTRAINT "HealthEscalationTree_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthEscalationTree" ADD CONSTRAINT "HealthEscalationTree_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCaregiverWellbeing" ADD CONSTRAINT "HealthCaregiverWellbeing_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthCaregiverWellbeing" ADD CONSTRAINT "HealthCaregiverWellbeing_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "HealthPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
