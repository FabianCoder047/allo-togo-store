/*
  Warnings:

  - The values [MOBILE_MONEY] on the enum `PaymentMethod` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PaymentMethod_new" AS ENUM ('ESPECES', 'FLOOZ', 'MIXX_BY_YAS', 'CARTE_BANCAIRE', 'VIREMENT', 'BICTORYS', 'AUTRE');
ALTER TABLE "Payment" ALTER COLUMN "method" TYPE "PaymentMethod_new" USING ("method"::text::"PaymentMethod_new");
ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";
DROP TYPE "public"."PaymentMethod_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "AssistantKnowledge" DROP CONSTRAINT "AssistantKnowledge_createdById_fkey";

-- DropIndex
DROP INDEX "User_role_active_idx";

-- AddForeignKey
ALTER TABLE "AssistantKnowledge" ADD CONSTRAINT "AssistantKnowledge_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
