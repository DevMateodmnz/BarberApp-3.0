-- Add append-only delivery attempt audit and OWNER manual retry metadata.

CREATE TYPE "NotificationAttemptOutcome" AS ENUM (
  'SENT',
  'TEMPORARY_FAILURE',
  'PERMANENT_FAILURE'
);

ALTER TABLE "appointment_notifications"
ADD COLUMN "manual_retry_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "last_manual_retry_at" TIMESTAMP(3),
ADD COLUMN "last_manual_retry_by_user_id" TEXT;

ALTER TABLE "appointment_notifications"
ADD CONSTRAINT "appointment_notifications_manual_retry_count_non_negative_check"
  CHECK ("manual_retry_count" >= 0),
ADD CONSTRAINT "appointment_notifications_manual_retry_metadata_check"
  CHECK (
    (
      "manual_retry_count" = 0
      AND "last_manual_retry_at" IS NULL
      AND "last_manual_retry_by_user_id" IS NULL
    )
    OR (
      "manual_retry_count" > 0
      AND "last_manual_retry_at" IS NOT NULL
      AND "last_manual_retry_by_user_id" IS NOT NULL
    )
  );

CREATE UNIQUE INDEX "appointment_notifications_id_barbershop_id_key"
ON "appointment_notifications"("id", "barbershop_id");

ALTER TABLE "appointment_notifications"
ADD CONSTRAINT "appointment_notifications_last_manual_retry_by_user_id_fkey"
FOREIGN KEY ("last_manual_retry_by_user_id")
REFERENCES "users"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE TABLE "appointment_notification_attempts" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "appointment_notification_id" TEXT NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "outcome" "NotificationAttemptOutcome" NOT NULL,
  "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "worker_token_hash" TEXT,
  "provider_message_id_hash" TEXT,
  "error_code" TEXT,
  "sanitized_error" VARCHAR(1000),
  "duration_ms" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "appointment_notification_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointment_notification_attempts_attempt_number_positive_check"
    CHECK ("attempt_number" > 0),
  CONSTRAINT "appointment_notification_attempts_duration_ms_non_negative_check"
    CHECK ("duration_ms" IS NULL OR "duration_ms" >= 0)
);

CREATE UNIQUE INDEX "appt_notif_attempts_notif_attempt_num_key"
ON "appointment_notification_attempts"("appointment_notification_id", "attempt_number");

CREATE INDEX "appt_notif_attempts_notif_attempted_idx"
ON "appointment_notification_attempts"("appointment_notification_id", "attempted_at");

CREATE INDEX "appt_notif_attempts_shop_attempted_idx"
ON "appointment_notification_attempts"("barbershop_id", "attempted_at");

ALTER TABLE "appointment_notification_attempts"
ADD CONSTRAINT "appointment_notification_attempts_appointment_notification_id_barbershop_id_fkey"
FOREIGN KEY ("appointment_notification_id", "barbershop_id")
REFERENCES "appointment_notifications"("id", "barbershop_id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "appointment_notification_attempts"
ADD CONSTRAINT "appointment_notification_attempts_barbershop_id_fkey"
FOREIGN KEY ("barbershop_id")
REFERENCES "barbershops"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
