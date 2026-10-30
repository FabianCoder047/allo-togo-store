ALTER TABLE "Product"
ADD COLUMN "previousPrice" INTEGER,
ADD COLUMN "cartonPrice" INTEGER,
ADD COLUMN "wholesalePrices" JSONB;

CREATE TABLE "ProductVideo" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductVideo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductVideo_productId_sortOrder_idx"
ON "ProductVideo"("productId", "sortOrder");

ALTER TABLE "ProductVideo"
ADD CONSTRAINT "ProductVideo_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
