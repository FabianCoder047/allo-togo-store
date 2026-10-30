-- Le rôle historique ADMIN devient DIRECTOR (Directeur).
-- Le rôle ADMIN est conservé pour le nouvel Informaticien / administrateur technique.
ALTER TYPE "StaffRole" ADD VALUE 'DIRECTOR' BEFORE 'ADMIN';
