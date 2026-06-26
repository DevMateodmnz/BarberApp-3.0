-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_client_id_fkey";

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "client_name" TEXT,
ADD COLUMN     "client_phone" TEXT,
ADD COLUMN     "service_currency" TEXT,
ADD COLUMN     "service_duration_minutes" INTEGER,
ADD COLUMN     "service_name" TEXT,
ADD COLUMN     "service_price_cents" INTEGER,
ALTER COLUMN "client_id" DROP NOT NULL;

-- Backfill frozen appointment data from current relations
UPDATE "appointments" AS a
SET
  "client_name" = COALESCE(u."name", u."email"),
  "client_phone" = NULL,
  "service_name" = s."name",
  "service_price_cents" = s."price_cents",
  "service_duration_minutes" = s."duration_minutes",
  "service_currency" = s."currency"
FROM "users" AS u,
     "services" AS s
WHERE a."client_id" = u."id"
  AND a."service_id" = s."id";

ALTER TABLE "appointments"
ALTER COLUMN "client_name" SET NOT NULL,
ALTER COLUMN "service_currency" SET NOT NULL,
ALTER COLUMN "service_duration_minutes" SET NOT NULL,
ALTER COLUMN "service_name" SET NOT NULL,
ALTER COLUMN "service_price_cents" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
