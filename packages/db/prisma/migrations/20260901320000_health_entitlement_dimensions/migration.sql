-- N0VA HEALTH entitlement dimensions — organization, patient population,
-- device catalog, AI model, data domain. Additive, backwards compatible.
ALTER TABLE "HealthEditionEntitlement" ADD COLUMN "organization" TEXT NOT NULL DEFAULT '';
ALTER TABLE "HealthEditionEntitlement" ADD COLUMN "patientPopulation" TEXT NOT NULL DEFAULT '';
ALTER TABLE "HealthEditionEntitlement" ADD COLUMN "deviceCatalog" TEXT NOT NULL DEFAULT '';
ALTER TABLE "HealthEditionEntitlement" ADD COLUMN "aiModel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "HealthEditionEntitlement" ADD COLUMN "dataDomain" TEXT NOT NULL DEFAULT '';
