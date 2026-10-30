-- Prénom et nom séparés pour l'édition du profil par le membre lui-même.
ALTER TABLE "User" ADD COLUMN "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN "lastName" TEXT;

-- Reprise des comptes existants : le premier mot devient le prénom, le reste le nom.
UPDATE "User"
SET "firstName" = split_part(btrim("name"), ' ', 1);

UPDATE "User"
SET "lastName" = NULLIF(
  btrim(substr(btrim("name"), length(split_part(btrim("name"), ' ', 1)) + 1)),
  ''
);
