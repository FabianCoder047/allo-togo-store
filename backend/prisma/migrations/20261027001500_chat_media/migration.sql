-- Ajout des messages image et vidéo dans la messagerie.
ALTER TYPE "MessageKind" ADD VALUE IF NOT EXISTS 'IMAGE';
ALTER TYPE "MessageKind" ADD VALUE IF NOT EXISTS 'VIDEO';

-- Les médias sont stockés en data URL pour le prototype, comme les notes vocales.
ALTER TABLE "Message"
  ADD COLUMN "mediaData" TEXT,
  ADD COLUMN "mediaMimeType" TEXT,
  ADD COLUMN "mediaName" TEXT,
  ADD COLUMN "mediaSize" INTEGER;
