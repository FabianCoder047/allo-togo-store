-- Drop the EMPLOYEE value from the StaffRole enum.
-- Prisma does not support removing an enum value directly, so we recreate the type.

BEGIN;

CREATE TYPE "StaffRole_new" AS ENUM ('DIRECTOR', 'ADMIN', 'COMMERCIAL', 'TECHNICIAN', 'DELIVERY');

ALTER TABLE "User" ALTER COLUMN "role" TYPE "StaffRole_new" USING ("role"::text::"StaffRole_new");

DROP TYPE "StaffRole";

ALTER TYPE "StaffRole_new" RENAME TO "StaffRole";

COMMIT;
