CREATE TYPE "CustomerPaymentChoice" AS ENUM ('ESPECES', 'FLOOZ', 'MIXX_BY_YAS');

ALTER TABLE "Order"
  ADD COLUMN "customerPaymentChoice" "CustomerPaymentChoice",
  ADD COLUMN "customerPaymentChoiceAt" TIMESTAMP(3);
