-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'AUDIO', 'LOCATION');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "accuracy" DOUBLE PRECISION,
ADD COLUMN     "audioData" TEXT,
ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "kind" "MessageKind" NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "locationLabel" TEXT,
ADD COLUMN     "longitude" DOUBLE PRECISION;
