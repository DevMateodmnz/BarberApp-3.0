CREATE TYPE "CommissionEntryType" AS ENUM ('ACCRUAL', 'REVERSAL');
CREATE TYPE "CommissionLiquidationStatus" AS ENUM ('OPEN', 'PAID', 'VOIDED');

ALTER TABLE "barbershops"
  ADD COLUMN "default_commission_basis_points" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "barbershops_default_commission_basis_points_check"
    CHECK ("default_commission_basis_points" BETWEEN 0 AND 10000);

CREATE TABLE "employee_commission_policies" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "percentage_basis_points" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "employee_commission_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_commission_policies_percentage_check"
    CHECK ("percentage_basis_points" BETWEEN 0 AND 10000)
);

CREATE TABLE "commission_liquidations" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "status" "CommissionLiquidationStatus" NOT NULL DEFAULT 'OPEN',
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "gross_amount_cents" INTEGER NOT NULL,
  "commission_amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "entry_count" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(100) NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "paid_by_user_id" TEXT,
  "paid_at" TIMESTAMP(3),
  "voided_by_user_id" TEXT,
  "voided_at" TIMESTAMP(3),
  "void_reason" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commission_liquidations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commission_liquidations_amounts_check"
    CHECK ("gross_amount_cents" >= 0 AND "commission_amount_cents" >= 0 AND "entry_count" > 0),
  CONSTRAINT "commission_liquidations_period_check" CHECK ("period_end" > "period_start")
);

CREATE TABLE "commission_entries" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "appointment_id" TEXT NOT NULL,
  "type" "CommissionEntryType" NOT NULL DEFAULT 'ACCRUAL',
  "gross_amount_cents" INTEGER NOT NULL,
  "percentage_basis_points" INTEGER NOT NULL,
  "commission_amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "earned_at" TIMESTAMP(3) NOT NULL,
  "liquidation_id" TEXT,
  "reversal_of_id" TEXT,
  "reason" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commission_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commission_entries_percentage_check"
    CHECK ("percentage_basis_points" BETWEEN 0 AND 10000),
  CONSTRAINT "commission_entries_accrual_amounts_check"
    CHECK ("type" <> 'ACCRUAL' OR ("gross_amount_cents" >= 0 AND "commission_amount_cents" >= 0))
);

CREATE UNIQUE INDEX "employee_commission_policies_employee_id_key" ON "employee_commission_policies"("employee_id");
CREATE UNIQUE INDEX "employee_commission_policies_employee_id_barbershop_id_key" ON "employee_commission_policies"("employee_id", "barbershop_id");
CREATE INDEX "employee_commission_policies_barbershop_id_idx" ON "employee_commission_policies"("barbershop_id");

CREATE UNIQUE INDEX "commission_liquidations_barbershop_id_idempotency_key_key" ON "commission_liquidations"("barbershop_id", "idempotency_key");
CREATE UNIQUE INDEX "commission_liquidations_id_barbershop_id_key" ON "commission_liquidations"("id", "barbershop_id");
CREATE INDEX "commission_liquidations_barbershop_id_employee_id_created_at_idx" ON "commission_liquidations"("barbershop_id", "employee_id", "created_at");
CREATE INDEX "commission_liquidations_barbershop_id_status_created_at_idx" ON "commission_liquidations"("barbershop_id", "status", "created_at");

CREATE UNIQUE INDEX "commission_entries_reversal_of_id_key" ON "commission_entries"("reversal_of_id");
CREATE UNIQUE INDEX "commission_entries_one_accrual_per_appointment_key"
  ON "commission_entries"("appointment_id") WHERE "type" = 'ACCRUAL';
CREATE INDEX "commission_entries_appointment_id_idx" ON "commission_entries"("appointment_id");
CREATE INDEX "commission_entries_barbershop_id_employee_id_earned_at_idx" ON "commission_entries"("barbershop_id", "employee_id", "earned_at");
CREATE INDEX "commission_entries_barbershop_id_employee_id_liquidation_idx" ON "commission_entries"("barbershop_id", "employee_id", "liquidation_id", "earned_at");
CREATE INDEX "commission_entries_liquidation_id_idx" ON "commission_entries"("liquidation_id");

ALTER TABLE "employee_commission_policies"
  ADD CONSTRAINT "employee_commission_policies_barbershop_id_fkey" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_commission_policies_employee_id_barbershop_id_fkey" FOREIGN KEY ("employee_id", "barbershop_id") REFERENCES "employees"("id", "barbershop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "commission_liquidations"
  ADD CONSTRAINT "commission_liquidations_barbershop_id_fkey" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commission_liquidations_employee_id_barbershop_id_fkey" FOREIGN KEY ("employee_id", "barbershop_id") REFERENCES "employees"("id", "barbershop_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commission_liquidations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commission_liquidations_paid_by_user_id_fkey" FOREIGN KEY ("paid_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commission_liquidations_voided_by_user_id_fkey" FOREIGN KEY ("voided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "commission_entries"
  ADD CONSTRAINT "commission_entries_barbershop_id_fkey" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commission_entries_employee_id_barbershop_id_fkey" FOREIGN KEY ("employee_id", "barbershop_id") REFERENCES "employees"("id", "barbershop_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commission_entries_appointment_id_barbershop_id_fkey" FOREIGN KEY ("appointment_id", "barbershop_id") REFERENCES "appointments"("id", "barbershop_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commission_entries_liquidation_id_barbershop_id_fkey" FOREIGN KEY ("liquidation_id", "barbershop_id") REFERENCES "commission_liquidations"("id", "barbershop_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commission_entries_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "commission_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing completed appointments are deliberately not backfilled. Commission
-- accrual starts prospectively when an appointment completes after deployment.
