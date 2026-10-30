-- Migration des comptes historiques : les anciens administrateurs deviennent directeurs.
UPDATE "User" SET "role" = 'DIRECTOR' WHERE "role" = 'ADMIN';
