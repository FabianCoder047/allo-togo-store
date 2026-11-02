UPDATE "Product"
SET
  "price" = 50000,
  "previousPrice" = NULL,
  "cartonPrice" = NULL,
  "wholesalePrices" = NULL,
  "quoteOnly" = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "type" = 'GPS';

UPDATE "Product"
SET
  "active" = false,
  "available" = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "type" = 'DRINK'
  AND "name" NOT ILIKE '%vitalo%';

UPDATE "Product"
SET
  "active" = true,
  "available" = true,
  "price" = 0,
  "previousPrice" = NULL,
  "cartonPrice" = NULL,
  "wholesalePrices" = NULL,
  "quoteOnly" = true,
  "specs" = COALESCE("specs", '{}'::jsonb) || '{"format":"Bouteille de 33 cl","modesDeVente":"À l’unité, en carton et en gros — tarifs à confirmer"}'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "type" = 'DRINK'
  AND "name" ILIKE '%vitalo%';
