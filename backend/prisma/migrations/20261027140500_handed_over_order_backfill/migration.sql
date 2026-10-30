WITH completed AS (
    SELECT "id", "status" AS "previousStatus", "operationalStatus" AS "previousOperational"
    FROM "Order"
    WHERE "fulfillmentMode" = 'LIVRAISON'
      AND "status" = 'EN_COURS_DE_LIVRAISON'
      AND "operationalStatus" = 'TERMINE'
      AND "fulfillmentCompletedAt" IS NOT NULL
), updated AS (
    UPDATE "Order" AS target
    SET "status" = 'LIVREE'
    FROM completed
    WHERE target."id" = completed."id"
    RETURNING target."id"
)
INSERT INTO "OrderStatusHistory" (
    "orderId", "fromStatus", "toStatus", "fromOperational", "toOperational",
    "actorType", "actorName", "comment", "publicComment", "createdAt"
)
SELECT
    completed."id", completed."previousStatus", 'LIVREE', completed."previousOperational", 'TERMINE',
    'SYSTEM', 'Système', 'Migration : remise déjà confirmée avant la mise à jour du parcours.', true, CURRENT_TIMESTAMP
FROM completed
JOIN updated USING ("id");

WITH collected AS (
    SELECT "id", "status" AS "previousStatus", "operationalStatus" AS "previousOperational"
    FROM "Order"
    WHERE "fulfillmentMode" = 'RETRAIT_AGENCE'
      AND "status" = 'DISPONIBLE_EN_AGENCE'
      AND "operationalStatus" = 'TERMINE'
      AND "fulfillmentCompletedAt" IS NOT NULL
), updated AS (
    UPDATE "Order" AS target
    SET "status" = 'RETIREE'
    FROM collected
    WHERE target."id" = collected."id"
    RETURNING target."id"
)
INSERT INTO "OrderStatusHistory" (
    "orderId", "fromStatus", "toStatus", "fromOperational", "toOperational",
    "actorType", "actorName", "comment", "publicComment", "createdAt"
)
SELECT
    collected."id", collected."previousStatus", 'RETIREE', collected."previousOperational", 'TERMINE',
    'SYSTEM', 'Système', 'Migration : retrait déjà confirmé avant la mise à jour du parcours.', true, CURRENT_TIMESTAMP
FROM collected
JOIN updated USING ("id");