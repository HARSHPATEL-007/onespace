-- Drift repair: sync chat thread table columns with schema.prisma.
ALTER TABLE "ThreadMetadata" ADD COLUMN "frozenUntil" TIMESTAMP(3);