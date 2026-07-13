ALTER TABLE "appointments"
ADD COLUMN "public_reference" TEXT,
ADD COLUMN "public_consent_accepted_at" TIMESTAMP(3),
ADD COLUMN "public_consent_version" TEXT;

CREATE UNIQUE INDEX "appointments_public_reference_key"
  ON "appointments"("public_reference");

CREATE TABLE "public_booking_idempotency" (
    "id" TEXT NOT NULL,
    "barbershop_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "appointment_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_booking_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "public_booking_idempotency_barbershop_id_operation_idempotency_key_key"
  ON "public_booking_idempotency"("barbershop_id", "operation", "idempotency_key");

CREATE INDEX "public_booking_idempotency_barbershop_id_idx"
  ON "public_booking_idempotency"("barbershop_id");

CREATE INDEX "public_booking_idempotency_appointment_id_idx"
  ON "public_booking_idempotency"("appointment_id");

CREATE INDEX "public_booking_idempotency_expires_at_idx"
  ON "public_booking_idempotency"("expires_at");

ALTER TABLE "public_booking_idempotency"
  ADD CONSTRAINT "public_booking_idempotency_barbershop_id_fkey"
  FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public_booking_idempotency"
  ADD CONSTRAINT "public_booking_idempotency_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
