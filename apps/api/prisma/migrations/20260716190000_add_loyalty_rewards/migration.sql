-- Loyalty rewards vertical slice.
-- Adds tenant-level loyalty configuration, cached customer loyalty summaries,
-- issued customer-bound rewards backed by promotions, and an immutable audit ledger.

CREATE TYPE "LoyaltyLedgerEventType" AS ENUM (
  'STAMP_EARNED',
  'REWARD_ISSUED',
  'REWARD_REDEEMED',
  'REWARD_EXPIRED',
  'REWARD_REVOKED',
  'ADMIN_ADJUSTMENT'
);

CREATE TYPE "LoyaltyRewardStatus" AS ENUM (
  'AVAILABLE',
  'REDEEMED',
  'EXPIRED',
  'REVOKED'
);

CREATE TABLE "barbershop_loyalty_programs" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT false,
  "visits_required" INTEGER NOT NULL DEFAULT 5,
  "reward_promotion_id" TEXT,
  "reward_validity_days" INTEGER,
  "created_by_user_id" TEXT NOT NULL,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "barbershop_loyalty_programs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "barbershop_loyalty_programs_visits_required_check"
    CHECK ("visits_required" BETWEEN 2 AND 20),
  CONSTRAINT "barbershop_loyalty_programs_reward_validity_days_check"
    CHECK ("reward_validity_days" IS NULL OR "reward_validity_days" BETWEEN 1 AND 365)
);

CREATE TABLE "customer_loyalty_summaries" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "current_stamp_count" INTEGER NOT NULL DEFAULT 0,
  "lifetime_eligible_visits" INTEGER NOT NULL DEFAULT 0,
  "available_reward_count" INTEGER NOT NULL DEFAULT 0,
  "last_earned_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customer_loyalty_summaries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_loyalty_summaries_nonnegative_check"
    CHECK (
      "current_stamp_count" >= 0
      AND "lifetime_eligible_visits" >= 0
      AND "available_reward_count" >= 0
    )
);

CREATE TABLE "loyalty_rewards" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "loyalty_program_id" TEXT NOT NULL,
  "promotion_id" TEXT NOT NULL,
  "source_appointment_id" TEXT,
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  "redeemed_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "redemption_appointment_id" TEXT,
  "status" "LoyaltyRewardStatus" NOT NULL DEFAULT 'AVAILABLE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "loyalty_rewards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "loyalty_rewards_timestamps_check"
    CHECK (
      ("redeemed_at" IS NULL OR "redeemed_at" >= "issued_at")
      AND ("revoked_at" IS NULL OR "revoked_at" >= "issued_at")
      AND ("expires_at" IS NULL OR "expires_at" > "issued_at")
    )
);

CREATE TABLE "loyalty_ledger_events" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "loyalty_program_id" TEXT,
  "loyalty_reward_id" TEXT,
  "source_appointment_id" TEXT,
  "actor_user_id" TEXT,
  "actor_role" "UserRole",
  "event_type" "LoyaltyLedgerEventType" NOT NULL,
  "stamp_delta" INTEGER NOT NULL DEFAULT 0,
  "reward_delta" INTEGER NOT NULL DEFAULT 0,
  "reason" VARCHAR(500),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "loyalty_ledger_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "barbershop_loyalty_programs_barbershop_id_key"
  ON "barbershop_loyalty_programs" ("barbershop_id");
CREATE UNIQUE INDEX "barbershop_loyalty_programs_reward_promotion_id_key"
  ON "barbershop_loyalty_programs" ("reward_promotion_id");
CREATE INDEX "barbershop_loyalty_programs_barbershop_id_is_enabled_idx"
  ON "barbershop_loyalty_programs" ("barbershop_id", "is_enabled");

CREATE UNIQUE INDEX "customer_loyalty_summaries_customer_id_key"
  ON "customer_loyalty_summaries" ("customer_id");
CREATE UNIQUE INDEX "customer_loyalty_summaries_customer_id_barbershop_id_key"
  ON "customer_loyalty_summaries" ("customer_id", "barbershop_id");
CREATE INDEX "customer_loyalty_summaries_barbershop_id_updated_at_idx"
  ON "customer_loyalty_summaries" ("barbershop_id", "updated_at");

CREATE UNIQUE INDEX "loyalty_rewards_promotion_id_key"
  ON "loyalty_rewards" ("promotion_id");
CREATE UNIQUE INDEX "loyalty_rewards_redemption_appointment_id_key"
  ON "loyalty_rewards" ("redemption_appointment_id");
CREATE INDEX "loyalty_rewards_barbershop_id_customer_id_status_issued_at_idx"
  ON "loyalty_rewards" ("barbershop_id", "customer_id", "status", "issued_at");
CREATE INDEX "loyalty_rewards_loyalty_program_id_status_issued_at_idx"
  ON "loyalty_rewards" ("loyalty_program_id", "status", "issued_at");

CREATE UNIQUE INDEX "loyalty_ledger_events_source_appointment_id_event_type_key"
  ON "loyalty_ledger_events" ("source_appointment_id", "event_type");
CREATE INDEX "loyalty_ledger_events_barbershop_id_created_at_idx"
  ON "loyalty_ledger_events" ("barbershop_id", "created_at");
CREATE INDEX "loyalty_ledger_events_customer_id_created_at_idx"
  ON "loyalty_ledger_events" ("customer_id", "created_at");
CREATE INDEX "loyalty_ledger_events_loyalty_program_id_created_at_idx"
  ON "loyalty_ledger_events" ("loyalty_program_id", "created_at");

ALTER TABLE "barbershop_loyalty_programs"
  ADD CONSTRAINT "barbershop_loyalty_programs_barbershop_id_fkey"
  FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "barbershop_loyalty_programs"
  ADD CONSTRAINT "barbershop_loyalty_programs_reward_promotion_id_fkey"
  FOREIGN KEY ("reward_promotion_id") REFERENCES "promotions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "barbershop_loyalty_programs"
  ADD CONSTRAINT "barbershop_loyalty_programs_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "barbershop_loyalty_programs"
  ADD CONSTRAINT "barbershop_loyalty_programs_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_loyalty_summaries"
  ADD CONSTRAINT "customer_loyalty_summaries_barbershop_id_fkey"
  FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_loyalty_summaries"
  ADD CONSTRAINT "customer_loyalty_summaries_customer_id_barbershop_id_fkey"
  FOREIGN KEY ("customer_id", "barbershop_id") REFERENCES "customers"("id", "barbershop_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "loyalty_rewards"
  ADD CONSTRAINT "loyalty_rewards_barbershop_id_fkey"
  FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_rewards"
  ADD CONSTRAINT "loyalty_rewards_customer_id_barbershop_id_fkey"
  FOREIGN KEY ("customer_id", "barbershop_id") REFERENCES "customers"("id", "barbershop_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_rewards"
  ADD CONSTRAINT "loyalty_rewards_loyalty_program_id_fkey"
  FOREIGN KEY ("loyalty_program_id") REFERENCES "barbershop_loyalty_programs"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_rewards"
  ADD CONSTRAINT "loyalty_rewards_promotion_id_fkey"
  FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_rewards"
  ADD CONSTRAINT "loyalty_rewards_source_appointment_id_fkey"
  FOREIGN KEY ("source_appointment_id") REFERENCES "appointments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "loyalty_rewards"
  ADD CONSTRAINT "loyalty_rewards_redemption_appointment_id_fkey"
  FOREIGN KEY ("redemption_appointment_id") REFERENCES "appointments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "loyalty_ledger_events"
  ADD CONSTRAINT "loyalty_ledger_events_barbershop_id_fkey"
  FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_ledger_events"
  ADD CONSTRAINT "loyalty_ledger_events_customer_id_barbershop_id_fkey"
  FOREIGN KEY ("customer_id", "barbershop_id") REFERENCES "customers"("id", "barbershop_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_ledger_events"
  ADD CONSTRAINT "loyalty_ledger_events_loyalty_program_id_fkey"
  FOREIGN KEY ("loyalty_program_id") REFERENCES "barbershop_loyalty_programs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "loyalty_ledger_events"
  ADD CONSTRAINT "loyalty_ledger_events_loyalty_reward_id_fkey"
  FOREIGN KEY ("loyalty_reward_id") REFERENCES "loyalty_rewards"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "loyalty_ledger_events"
  ADD CONSTRAINT "loyalty_ledger_events_source_appointment_id_fkey"
  FOREIGN KEY ("source_appointment_id") REFERENCES "appointments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "loyalty_ledger_events"
  ADD CONSTRAINT "loyalty_ledger_events_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
