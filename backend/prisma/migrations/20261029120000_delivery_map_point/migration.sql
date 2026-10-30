-- Point de livraison précis choisi sur Google Maps.
-- Les coordonnées permettent l’aperçu et la navigation ; le lien est conservé
-- pour les partages courts (maps.app.goo.gl) qui ne contiennent pas de coordonnées.
ALTER TABLE "Order"
  ADD COLUMN "deliveryLatitude" DOUBLE PRECISION,
  ADD COLUMN "deliveryLongitude" DOUBLE PRECISION,
  ADD COLUMN "deliveryMapUrl" TEXT;
