-- Federation Layer: Sovereign Interoperability Stack

DO $$ BEGIN CREATE TYPE "FederationProtocol" AS ENUM ('N0VA_NATIVE','MATRIX','XMPP','SLACK_BRIDGE','DISCORD_BRIDGE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "FederationMode" AS ENUM ('PRODUCTION','BETA','PLANNED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "TrustLevel" AS ENUM ('VIEWER','CONTRIBUTOR','PARTNER','VENDOR','FULL'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "FederationStatus" AS ENUM ('PENDING','ACTIVE','PAUSED','ERROR','REVOKED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "FederationPolicyType" AS ENUM ('OPEN','CLOSED','WHITELIST'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "GuestTier" AS ENUM ('VIEWER','CONTRIBUTOR','PARTNER','VENDOR','TEMPORARY'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "GuestStatus" AS ENUM ('PENDING','ACTIVE','EXPIRED','REVOKED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE "FederationConnection" (
    "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "protocol" "FederationProtocol" NOT NULL, "mode" "FederationMode" NOT NULL,
    "remoteDomain" TEXT NOT NULL, "remoteRoomId" TEXT, "localChannelId" TEXT, "trustLevel" "TrustLevel" NOT NULL DEFAULT 'PARTNER',
    "status" "FederationStatus" NOT NULL DEFAULT 'PENDING', "capabilities" TEXT[] NOT NULL DEFAULT '{}', "config" JSONB NOT NULL DEFAULT '{}',
    "lastSyncAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FederationConnection_pkey" PRIMARY KEY ("id"));
CREATE INDEX "FederationConnection_workspaceId_protocol_idx" ON "FederationConnection"("workspaceId", "protocol");
ALTER TABLE "FederationConnection" ADD CONSTRAINT "FederationConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FederatedIdentity" (
    "id" TEXT NOT NULL, "connectionId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "externalUserId" TEXT NOT NULL,
    "externalProtocol" TEXT NOT NULL, "localAlias" TEXT NOT NULL, "displayName" TEXT, "trustLevel" "TrustLevel" NOT NULL DEFAULT 'PARTNER',
    "roleMapping" TEXT NOT NULL DEFAULT 'guest', "avatarUrl" TEXT, "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FederatedIdentity_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "FederationIdentity_connectionId_externalUserId_key" ON "FederatedIdentity"("connectionId", "externalUserId");
ALTER TABLE "FederatedIdentity" ADD CONSTRAINT "FederationIdentity_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "FederationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FederatedIdentity" ADD CONSTRAINT "FederationIdentity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FederationPolicy" (
    "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "policyType" "FederationPolicyType" NOT NULL DEFAULT 'WHITELIST',
    "domainRules" JSONB NOT NULL DEFAULT '[]', "contentRules" JSONB NOT NULL DEFAULT '[]', "enabled" BOOLEAN NOT NULL DEFAULT true,
    "breakGlass" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FederationPolicy_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "FederationPolicy_workspaceId_key" ON "FederationPolicy"("workspaceId");
ALTER TABLE "FederationPolicy" ADD CONSTRAINT "FederationPolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FederationAuditLog" (
    "id" TEXT NOT NULL, "connectionId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "action" TEXT NOT NULL, "actorId" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FederationAuditLog_pkey" PRIMARY KEY ("id"));
CREATE INDEX "FederationAuditLog_connectionId_createdAt_idx" ON "FederationAuditLog"("connectionId", "createdAt" DESC);
ALTER TABLE "FederationAuditLog" ADD CONSTRAINT "FederationAuditLog_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "FederationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FederationAuditLog" ADD CONSTRAINT "FederationAuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GuestAccess" (
    "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "channelId" TEXT, "guestEmail" TEXT NOT NULL, "guestName" TEXT NOT NULL,
    "accessTier" "GuestTier" NOT NULL DEFAULT 'VIEWER', "invitedById" TEXT NOT NULL, "roomScope" TEXT[] NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3), "lastAccessAt" TIMESTAMP(3), "status" "GuestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "GuestAccess_pkey" PRIMARY KEY ("id"));
CREATE INDEX "GuestAccess_workspaceId_status_idx" ON "GuestAccess"("workspaceId", "status");
ALTER TABLE "GuestAccess" ADD CONSTRAINT "GuestAccess_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestAccess" ADD CONSTRAINT "GuestAccess_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
