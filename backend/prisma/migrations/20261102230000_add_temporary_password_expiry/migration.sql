ALTER TABLE "User"
ADD COLUMN "passwordExpiresAt" TIMESTAMP(3);

UPDATE "User"
SET "passwordExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '15 minutes'
WHERE "mustChangePassword" = true;
