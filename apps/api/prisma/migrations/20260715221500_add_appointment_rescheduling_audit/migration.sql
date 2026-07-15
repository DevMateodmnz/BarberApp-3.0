-- Add durable appointment rescheduling audit and notification support.

ALTER TYPE "AppointmentNotificationType"
ADD VALUE IF NOT EXISTS 'APPOINTMENT_RESCHEDULED';

CREATE TYPE "AppointmentChangeType" AS ENUM (
  'RESCHEDULED'
);

CREATE TABLE "appointment_changes" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "appointment_id" TEXT NOT NULL,
  "type" "AppointmentChangeType" NOT NULL,
  "changed_by_user_id" TEXT NOT NULL,
  "changed_by_role" "UserRole" NOT NULL,
  "previous_employee_id" TEXT NOT NULL,
  "previous_employee_name" TEXT NOT NULL,
  "previous_service_id" TEXT NOT NULL,
  "previous_service_name" TEXT NOT NULL,
  "previous_start_at" TIMESTAMP(3) NOT NULL,
  "previous_end_at" TIMESTAMP(3) NOT NULL,
  "new_employee_id" TEXT NOT NULL,
  "new_employee_name" TEXT NOT NULL,
  "new_service_id" TEXT NOT NULL,
  "new_service_name" TEXT NOT NULL,
  "new_start_at" TIMESTAMP(3) NOT NULL,
  "new_end_at" TIMESTAMP(3) NOT NULL,
  "reason" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "appointment_changes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointment_changes_previous_window_check"
    CHECK ("previous_start_at" < "previous_end_at"),
  CONSTRAINT "appointment_changes_new_window_check"
    CHECK ("new_start_at" < "new_end_at")
);

CREATE INDEX "appointment_changes_appointment_id_created_at_idx"
ON "appointment_changes"("appointment_id", "created_at");

CREATE INDEX "appointment_changes_barbershop_id_created_at_idx"
ON "appointment_changes"("barbershop_id", "created_at");

CREATE INDEX "appointment_changes_changed_by_user_id_idx"
ON "appointment_changes"("changed_by_user_id");

ALTER TABLE "appointment_changes"
ADD CONSTRAINT "appointment_changes_appointment_id_barbershop_id_fkey"
FOREIGN KEY ("appointment_id", "barbershop_id")
REFERENCES "appointments"("id", "barbershop_id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "appointment_changes"
ADD CONSTRAINT "appointment_changes_barbershop_id_fkey"
FOREIGN KEY ("barbershop_id")
REFERENCES "barbershops"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "appointment_changes"
ADD CONSTRAINT "appointment_changes_changed_by_user_id_fkey"
FOREIGN KEY ("changed_by_user_id")
REFERENCES "users"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
