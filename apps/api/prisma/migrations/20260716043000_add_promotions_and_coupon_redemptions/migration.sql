CREATE TYPE "PromotionDiscountType" AS ENUM ('FIXED', 'PERCENTAGE');
CREATE TYPE "PromotionServiceScope" AS ENUM ('ALL', 'SELECTED');
CREATE TYPE "PromotionRedemptionStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');
CREATE TYPE "PromotionRedemptionReleaseReason" AS ENUM (
  'HOLD_EXPIRED',
  'PAYMENT_REJECTED',
  'PAYMENT_CANCELLED',
  'PUBLIC_CANCELLED',
  'PREFERENCE_CREATION_FAILED'
);

ALTER TABLE "services"
  ADD CONSTRAINT "services_price_cents_positive_check"
  CHECK ("price_cents" >= 0);

ALTER TABLE "services"
  ADD CONSTRAINT "services_duration_minutes_positive_check"
  CHECK ("duration_minutes" > 0);

CREATE UNIQUE INDEX "services_id_barbershop_id_key"
  ON "services" ("id", "barbershop_id");

ALTER TABLE "appointments"
  ADD COLUMN "discount_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "final_price_cents" INTEGER NOT NULL DEFAULT 0;

UPDATE "appointments"
SET
  "discount_cents" = 0,
  "final_price_cents" = "service_price_cents"
WHERE "final_price_cents" = 0;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_price_snapshot_check"
  CHECK (
    "service_price_cents" >= 0
    AND "discount_cents" >= 0
    AND "discount_cents" <= "service_price_cents"
    AND "final_price_cents" >= 0
    AND "final_price_cents" = ("service_price_cents" - "discount_cents")
  );

CREATE TABLE "promotions" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "code_normalized" TEXT NOT NULL,
  "discount_type" "PromotionDiscountType" NOT NULL,
  "fixed_discount_cents" INTEGER,
  "percentage_basis_points" INTEGER,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "applies_to_public_bookings" BOOLEAN NOT NULL DEFAULT TRUE,
  "applies_to_staff_bookings" BOOLEAN NOT NULL DEFAULT TRUE,
  "max_active_redemptions" INTEGER,
  "max_redemptions_per_customer" INTEGER,
  "active_redemption_count" INTEGER NOT NULL DEFAULT 0,
  "minimum_price_cents" INTEGER,
  "service_scope" "PromotionServiceScope" NOT NULL DEFAULT 'ALL',
  "created_by_user_id" TEXT NOT NULL,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "promotions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promotions_window_check"
    CHECK ("starts_at" < "ends_at"),
  CONSTRAINT "promotions_channel_check"
    CHECK ("applies_to_public_bookings" OR "applies_to_staff_bookings"),
  CONSTRAINT "promotions_policy_shape_check"
    CHECK (
      (
        "discount_type" = 'FIXED'
        AND "fixed_discount_cents" IS NOT NULL
        AND "fixed_discount_cents" > 0
        AND "percentage_basis_points" IS NULL
      )
      OR (
        "discount_type" = 'PERCENTAGE'
        AND "percentage_basis_points" IS NOT NULL
        AND "percentage_basis_points" BETWEEN 1 AND 10000
        AND "fixed_discount_cents" IS NULL
      )
    ),
  CONSTRAINT "promotions_limit_check"
    CHECK (
      "active_redemption_count" >= 0
      AND ("max_active_redemptions" IS NULL OR "max_active_redemptions" >= 1)
      AND ("max_redemptions_per_customer" IS NULL OR "max_redemptions_per_customer" BETWEEN 1 AND 1000)
      AND ("minimum_price_cents" IS NULL OR "minimum_price_cents" >= 0)
      AND ("max_active_redemptions" IS NULL OR "active_redemption_count" <= "max_active_redemptions")
    )
);

CREATE UNIQUE INDEX "promotions_barbershop_id_code_normalized_key"
  ON "promotions" ("barbershop_id", "code_normalized");
CREATE UNIQUE INDEX "promotions_id_barbershop_id_key"
  ON "promotions" ("id", "barbershop_id");
CREATE INDEX "promotions_barbershop_id_is_active_starts_at_ends_at_idx"
  ON "promotions" ("barbershop_id", "is_active", "starts_at", "ends_at");

ALTER TABLE "promotions"
  ADD CONSTRAINT "promotions_barbershop_id_fkey"
  FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promotions"
  ADD CONSTRAINT "promotions_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promotions"
  ADD CONSTRAINT "promotions_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "promotion_services" (
  "promotion_id" TEXT NOT NULL,
  "service_id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "promotion_services_pkey" PRIMARY KEY ("promotion_id", "service_id")
);

CREATE INDEX "promotion_services_service_id_idx"
  ON "promotion_services" ("service_id");
CREATE INDEX "promotion_services_barbershop_id_idx"
  ON "promotion_services" ("barbershop_id");

ALTER TABLE "promotion_services"
  ADD CONSTRAINT "promotion_services_promotion_id_fkey"
  FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promotion_services"
  ADD CONSTRAINT "promotion_services_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "services"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promotion_services"
  ADD CONSTRAINT "promotion_services_barbershop_id_fkey"
  FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "promotion_customer_usages" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "promotion_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "active_redemption_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "promotion_customer_usages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promotion_customer_usages_count_check"
    CHECK ("active_redemption_count" >= 0)
);

CREATE UNIQUE INDEX "promotion_customer_usages_promotion_id_customer_id_key"
  ON "promotion_customer_usages" ("promotion_id", "customer_id");
CREATE INDEX "promotion_customer_usages_barbershop_id_promotion_id_idx"
  ON "promotion_customer_usages" ("barbershop_id", "promotion_id");

ALTER TABLE "promotion_customer_usages"
  ADD CONSTRAINT "promotion_customer_usages_barbershop_id_fkey"
  FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promotion_customer_usages"
  ADD CONSTRAINT "promotion_customer_usages_promotion_id_fkey"
  FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promotion_customer_usages"
  ADD CONSTRAINT "promotion_customer_usages_customer_id_barbershop_id_fkey"
  FOREIGN KEY ("customer_id", "barbershop_id") REFERENCES "customers"("id", "barbershop_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "promotion_redemptions" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "promotion_id" TEXT NOT NULL,
  "appointment_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "status" "PromotionRedemptionStatus" NOT NULL,
  "code_snapshot" TEXT NOT NULL,
  "promotion_name_snapshot" TEXT NOT NULL,
  "discount_type_snapshot" "PromotionDiscountType" NOT NULL,
  "policy_value_snapshot" INTEGER NOT NULL,
  "service_price_cents" INTEGER NOT NULL,
  "discount_cents" INTEGER NOT NULL,
  "final_price_cents" INTEGER NOT NULL,
  "reserved_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "released_at" TIMESTAMP(3),
  "release_reason" "PromotionRedemptionReleaseReason",
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "promotion_redemptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promotion_redemptions_price_snapshot_check"
    CHECK (
      "service_price_cents" >= 0
      AND "discount_cents" >= 0
      AND "discount_cents" <= "service_price_cents"
      AND "final_price_cents" = ("service_price_cents" - "discount_cents")
      AND "policy_value_snapshot" > 0
    ),
  CONSTRAINT "promotion_redemptions_status_timestamp_check"
    CHECK (
      (
        "status" = 'RESERVED'
        AND "consumed_at" IS NULL
        AND "released_at" IS NULL
        AND "release_reason" IS NULL
      )
      OR (
        "status" = 'CONSUMED'
        AND "consumed_at" IS NOT NULL
        AND "released_at" IS NULL
        AND "release_reason" IS NULL
      )
      OR (
        "status" = 'RELEASED'
        AND "consumed_at" IS NULL
        AND "released_at" IS NOT NULL
        AND "release_reason" IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX "promotion_redemptions_appointment_id_key"
  ON "promotion_redemptions" ("appointment_id");
CREATE INDEX "promotion_redemptions_promotion_id_status_created_at_idx"
  ON "promotion_redemptions" ("promotion_id", "status", "created_at");
CREATE INDEX "promotion_redemptions_customer_id_promotion_id_status_idx"
  ON "promotion_redemptions" ("customer_id", "promotion_id", "status");
CREATE INDEX "promotion_redemptions_barbershop_id_status_created_at_idx"
  ON "promotion_redemptions" ("barbershop_id", "status", "created_at");

ALTER TABLE "promotion_redemptions"
  ADD CONSTRAINT "promotion_redemptions_barbershop_id_fkey"
  FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promotion_redemptions"
  ADD CONSTRAINT "promotion_redemptions_promotion_id_fkey"
  FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promotion_redemptions"
  ADD CONSTRAINT "promotion_redemptions_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promotion_redemptions"
  ADD CONSTRAINT "promotion_redemptions_customer_id_barbershop_id_fkey"
  FOREIGN KEY ("customer_id", "barbershop_id") REFERENCES "customers"("id", "barbershop_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
