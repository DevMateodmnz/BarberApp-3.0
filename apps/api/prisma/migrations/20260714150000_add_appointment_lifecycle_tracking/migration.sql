-- Phase 1: no-show prevention lifecycle foundation.
-- Purely additive, nullable columns + one composite index for the
-- tenant-scoped customer lookup endpoint. No data backfill: legacy
-- rows remain valid and the new fields stay NULL until the next
-- transition or new booking normalizes them.
ALTER TABLE "appointments"
  ADD COLUMN "started_at" TIMESTAMP(3),
  ADD COLUMN "confirmed_at" TIMESTAMP(3),
  ADD COLUMN "completed_at" TIMESTAMP(3),
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "no_show_at" TIMESTAMP(3),
  ADD COLUMN "cancelled_by_role" "UserRole",
  ADD COLUMN "cancel_reason" VARCHAR(500),
  ADD COLUMN "client_phone_normalized" VARCHAR(20);

-- Supports GET /api/v1/barbershops/:barbershopId/customers/lookup?phone=...
-- which filters by tenant + normalized phone.
CREATE INDEX "appointments_barbershop_id_client_phone_normalized_idx"
  ON "appointments"("barbershop_id", "client_phone_normalized");
