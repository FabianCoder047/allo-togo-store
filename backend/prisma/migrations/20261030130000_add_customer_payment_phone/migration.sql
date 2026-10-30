-- Add missing column customerPaymentPhone to Order table.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerPaymentPhone" TEXT;
