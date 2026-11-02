ALTER TABLE "User"
ADD COLUMN "hiddenAt" TIMESTAMP(3);

CREATE INDEX "User_role_active_hiddenAt_idx"
ON "User"("role", "active", "hiddenAt");
