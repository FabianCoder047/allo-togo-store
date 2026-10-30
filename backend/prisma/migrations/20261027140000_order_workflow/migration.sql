ALTER TYPE "StaffRole" ADD VALUE 'COMMERCIAL';

ALTER TYPE "OrderStatus" ADD VALUE 'REFUSEE';
ALTER TYPE "OrderStatus" ADD VALUE 'RETIREE';

ALTER TABLE "DeliveryAssignment"
ADD COLUMN "isLead" BOOLEAN NOT NULL DEFAULT false;

UPDATE "DeliveryAssignment" AS assignment
SET "isLead" = true
FROM "Order" AS order_record
WHERE assignment."orderId" = order_record."id"
	AND assignment."staffId" = order_record."assignedToId"
	AND assignment."active" = true;

CREATE UNIQUE INDEX "DeliveryAssignment_one_active_lead_per_order_key"
ON "DeliveryAssignment" ("orderId")
WHERE "active" = true AND "isLead" = true;