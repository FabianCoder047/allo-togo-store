-- Migration du vocabulaire des statuts vers les 8 codes métier uniques.
-- Aucune donnée métier n'est supprimée : les statuts historiques sont fusionnés
-- vers leur équivalent actuel (RETIREE -> LIVREE, DISPONIBLE_EN_AGENCE ->
-- COMMANDE_ACCEPTEE) avant le changement de type.

-- 1) Fusion des statuts retirés (avant de remplacer le type enum).
UPDATE "Order" SET status = 'LIVREE' WHERE status = 'RETIREE';
UPDATE "Order" SET status = 'COMMANDE_ACCEPTEE' WHERE status = 'DISPONIBLE_EN_AGENCE';

UPDATE "OrderStatusHistory" SET "toStatus" = 'LIVREE' WHERE "toStatus" = 'RETIREE';
UPDATE "OrderStatusHistory" SET "fromStatus" = 'LIVREE' WHERE "fromStatus" = 'RETIREE';
UPDATE "OrderStatusHistory" SET "toStatus" = 'COMMANDE_ACCEPTEE' WHERE "toStatus" = 'DISPONIBLE_EN_AGENCE';
UPDATE "OrderStatusHistory" SET "fromStatus" = 'COMMANDE_ACCEPTEE' WHERE "fromStatus" = 'DISPONIBLE_EN_AGENCE';

-- 2) Nouveau type enum avec les 8 statuts définitifs.
CREATE TYPE "OrderStatus_new" AS ENUM (
  'EN_ATTENTE_CONFIRMATION',
  'COMMANDE_ACCEPTEE',
  'COMMANDE_EN_PREPARATION',
  'COMMANDE_EN_COURS_DE_LIVRAISON',
  'LIVREE',
  'ECHEC_LIVRAISON',
  'REJETEE',
  'ANNULEE'
);

ALTER TABLE "Order" ALTER COLUMN status DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN status TYPE "OrderStatus_new" USING (
  CASE status::text
    WHEN 'ATTENTE_CONFIRMATION' THEN 'EN_ATTENTE_CONFIRMATION'
    WHEN 'EN_PREPARATION' THEN 'COMMANDE_EN_PREPARATION'
    WHEN 'EN_COURS_DE_LIVRAISON' THEN 'COMMANDE_EN_COURS_DE_LIVRAISON'
    WHEN 'REFUSEE' THEN 'REJETEE'
    ELSE status::text
  END
)::"OrderStatus_new";
ALTER TABLE "Order" ALTER COLUMN status SET DEFAULT 'EN_ATTENTE_CONFIRMATION';

ALTER TABLE "OrderStatusHistory" ALTER COLUMN "fromStatus" TYPE "OrderStatus_new" USING (
  CASE "fromStatus"::text
    WHEN 'ATTENTE_CONFIRMATION' THEN 'EN_ATTENTE_CONFIRMATION'
    WHEN 'EN_PREPARATION' THEN 'COMMANDE_EN_PREPARATION'
    WHEN 'EN_COURS_DE_LIVRAISON' THEN 'COMMANDE_EN_COURS_DE_LIVRAISON'
    WHEN 'REFUSEE' THEN 'REJETEE'
    ELSE "fromStatus"::text
  END
)::"OrderStatus_new";

ALTER TABLE "OrderStatusHistory" ALTER COLUMN "toStatus" TYPE "OrderStatus_new" USING (
  CASE "toStatus"::text
    WHEN 'ATTENTE_CONFIRMATION' THEN 'EN_ATTENTE_CONFIRMATION'
    WHEN 'EN_PREPARATION' THEN 'COMMANDE_EN_PREPARATION'
    WHEN 'EN_COURS_DE_LIVRAISON' THEN 'COMMANDE_EN_COURS_DE_LIVRAISON'
    WHEN 'REFUSEE' THEN 'REJETEE'
    ELSE "toStatus"::text
  END
)::"OrderStatus_new";

DROP TYPE "OrderStatus";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";

-- 3) Échéance de retrait explicite (72 h après l'acceptation).
ALTER TABLE "Order" ADD COLUMN "pickupDeadlineAt" TIMESTAMP(3);

UPDATE "Order"
SET "pickupDeadlineAt" = "confirmedAt" + INTERVAL '72 hours'
WHERE "fulfillmentMode" = 'RETRAIT_AGENCE'
  AND "confirmedAt" IS NOT NULL
  AND "fulfillmentCompletedAt" IS NULL
  AND status = 'COMMANDE_ACCEPTEE';

CREATE INDEX "Order_fulfillmentMode_status_pickupDeadlineAt_idx"
  ON "Order" ("fulfillmentMode", "status", "pickupDeadlineAt");
