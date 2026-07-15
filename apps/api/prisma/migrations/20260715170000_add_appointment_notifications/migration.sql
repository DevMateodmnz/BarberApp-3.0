-- Add appointment email snapshots and a durable appointment notification outbox.

CREATE TYPE "AppointmentNotificationType" AS ENUM ('BOOKING_CONFIRMATION', 'REMINDER_24H');
CREATE TYPE "AppointmentNotificationChannel" AS ENUM ('EMAIL');
CREATE TYPE "AppointmentNotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

ALTER TABLE "appointments"
ADD COLUMN "client_email" TEXT;

CREATE UNIQUE INDEX "appointments_id_barbershop_id_key"
ON "appointments"("id", "barbershop_id");

CREATE TABLE "appointment_notifications" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "appointment_id" TEXT NOT NULL,
  "type" "AppointmentNotificationType" NOT NULL,
  "channel" "AppointmentNotificationChannel" NOT NULL,
  "status" "AppointmentNotificationStatus" NOT NULL DEFAULT 'PENDING',
  "recipient_email" TEXT NOT NULL,
  "scheduled_for" TIMESTAMP(3) NOT NULL,
  "next_attempt_at" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lock_token" TEXT,
  "locked_at" TIMESTAMP(3),
  "last_error" VARCHAR(1000),
  "sent_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "provider_message_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "appointment_notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointment_notifications_attempts_non_negative_check"
    CHECK ("attempts" >= 0),
  CONSTRAINT "appointment_notifications_processing_lock_check"
    CHECK (
      (
        "status" = 'PROCESSING'
        AND "lock_token" IS NOT NULL
        AND "locked_at" IS NOT NULL
      )
      OR (
        "status" <> 'PROCESSING'
        AND "lock_token" IS NULL
        AND "locked_at" IS NULL
      )
    ),
  CONSTRAINT "appointment_notifications_sent_state_check"
    CHECK (("status" = 'SENT') = ("sent_at" IS NOT NULL)),
  CONSTRAINT "appointment_notifications_cancelled_state_check"
    CHECK (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "appointment_notifications_idempotency_key_key"
ON "appointment_notifications"("idempotency_key");

CREATE INDEX "appointment_notifications_status_next_attempt_at_idx"
ON "appointment_notifications"("status", "next_attempt_at");

CREATE INDEX "appointment_notifications_appointment_id_status_idx"
ON "appointment_notifications"("appointment_id", "status");

CREATE INDEX "appointment_notifications_barbershop_id_created_at_idx"
ON "appointment_notifications"("barbershop_id", "created_at");

ALTER TABLE "appointment_notifications"
ADD CONSTRAINT "appointment_notifications_appointment_id_barbershop_id_fkey"
FOREIGN KEY ("appointment_id", "barbershop_id")
REFERENCES "appointments"("id", "barbershop_id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "appointment_notifications"
ADD CONSTRAINT "appointment_notifications_barbershop_id_fkey"
FOREIGN KEY ("barbershop_id")
REFERENCES "barbershops"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
