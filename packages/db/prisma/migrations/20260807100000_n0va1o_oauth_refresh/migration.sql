-- Add OAuth refresh token support to IntegrationConnection
ALTER TABLE "IntegrationConnection" ADD COLUMN "refreshToken" TEXT;
ALTER TABLE "IntegrationConnection" ADD COLUMN "refreshTokenExpiresAt" TIMESTAMP(3);
