CREATE TYPE "DepositPolicyMode" AS ENUM (
  'DISABLED',
  'FIXED',
  'PERCENTAGE'
);

CREATE TYPE "PaymentProvider" AS ENUM (
  'MERCADO_PAGO'
);

CREATE TYPE "PaymentConnectionStatus" AS ENUM (
  'DISCONNECTED',
  'CONNECTING',
  'CONNECTED',
  'REFRESH_REQUIRED',
  'REVOKED',
  'ERROR'
);

CREATE TYPE "BookingPaymentPurpose" AS ENUM (
  'DEPOSIT'
);

CREATE TYPE "BookingPaymentStatus" AS ENUM (
  'CREATING',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
  'REVIEW_REQUIRED',
  'ERROR'
);

CREATE TYPE "PaymentWebhookEventStatus" AS ENUM (
  'RECEIVED',
  'PROCESSING',
  'PROCESSED',
  'REJECTED',
  'ERROR'
);

ALTER TABLE "appointments"
  ADD COLUMN "payment_hold_expires_at" TIMESTAMP(3),
  ADD COLUMN "payment_confirmed_at" TIMESTAMP(3);

CREATE INDEX "appointments_payment_hold_expires_at_idx"
  ON "appointments"("payment_hold_expires_at");

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_payment_hold_state_check"
  CHECK (
    (
      status = 'PENDING'
      AND payment_confirmed_at IS NULL
    )
    OR (
      status IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED')
      AND payment_hold_expires_at IS NULL
    )
  );

CREATE TABLE "barbershop_deposit_policies" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "mode" "DepositPolicyMode" NOT NULL DEFAULT 'DISABLED',
  "fixed_amount_cents" INTEGER,
  "percentage_basis_points" INTEGER,
  "hold_duration_minutes" INTEGER NOT NULL DEFAULT 15,
  "currency" TEXT NOT NULL DEFAULT 'ARS',
  "public_terms" VARCHAR(1000),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "barbershop_deposit_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "barbershop_deposit_policies_mode_shape_check"
    CHECK (
      (
        mode = 'DISABLED'
        AND fixed_amount_cents IS NULL
        AND percentage_basis_points IS NULL
      )
      OR (
        mode = 'FIXED'
        AND fixed_amount_cents IS NOT NULL
        AND fixed_amount_cents > 0
        AND percentage_basis_points IS NULL
      )
      OR (
        mode = 'PERCENTAGE'
        AND fixed_amount_cents IS NULL
        AND percentage_basis_points IS NOT NULL
        AND percentage_basis_points BETWEEN 1 AND 10000
      )
    ),
  CONSTRAINT "barbershop_deposit_policies_hold_duration_check"
    CHECK ("hold_duration_minutes" BETWEEN 5 AND 30),
  CONSTRAINT "barbershop_deposit_policies_currency_check"
    CHECK ("currency" = 'ARS')
);

CREATE UNIQUE INDEX "barbershop_deposit_policies_barbershop_id_key"
  ON "barbershop_deposit_policies"("barbershop_id");

ALTER TABLE "barbershop_deposit_policies"
  ADD CONSTRAINT "barbershop_deposit_policies_barbershop_id_fkey"
  FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "barbershop_payment_connections" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "status" "PaymentConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "provider_seller_id" TEXT,
  "provider_public_key" TEXT,
  "access_token_ciphertext" TEXT,
  "refresh_token_ciphertext" TEXT,
  "token_expires_at" TIMESTAMP(3),
  "scopes" VARCHAR(1000),
  "connected_at" TIMESTAMP(3),
  "last_refreshed_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "last_error_code" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "barbershop_payment_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "barbershop_payment_connections_secret_shape_check"
    CHECK (
      (status IN ('DISCONNECTED', 'REVOKED') AND access_token_ciphertext IS NULL AND refresh_token_ciphertext IS NULL)
      OR (status IN ('CONNECTING', 'CONNECTED', 'REFRESH_REQUIRED', 'ERROR'))
    )
);

CREATE UNIQUE INDEX "barbershop_payment_connections_barbershop_id_provider_key"
  ON "barbershop_payment_connections"("barbershop_id", "provider");

CREATE INDEX "barbershop_payment_connections_barbershop_id_status_idx"
  ON "barbershop_payment_connections"("barbershop_id", "status");

ALTER TABLE "barbershop_payment_connections"
  ADD CONSTRAINT "barbershop_payment_connections_barbershop_id_fkey"
  FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "payment_oauth_states" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "initiated_by_user_id" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "state_hash" TEXT NOT NULL,
  "pkce_verifier_ciphertext" TEXT NOT NULL,
  "redirect_target" VARCHAR(500),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payment_oauth_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_oauth_states_state_hash_key"
  ON "payment_oauth_states"("state_hash");

CREATE INDEX "payment_oauth_states_barbershop_id_provider_expires_at_idx"
  ON "payment_oauth_states"("barbershop_id", "provider", "expires_at");

ALTER TABLE "payment_oauth_states"
  ADD CONSTRAINT "payment_oauth_states_barbershop_id_fkey"
  FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_oauth_states"
  ADD CONSTRAINT "payment_oauth_states_initiated_by_user_id_fkey"
  FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_oauth_states"
  ADD CONSTRAINT "payment_oauth_states_barbershop_id_provider_fkey"
  FOREIGN KEY ("barbershop_id", "provider") REFERENCES "barbershop_payment_connections"("barbershop_id", "provider")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "booking_payments" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "appointment_id" TEXT NOT NULL,
  "payment_connection_id" TEXT,
  "provider" "PaymentProvider" NOT NULL,
  "purpose" "BookingPaymentPurpose" NOT NULL,
  "status" "BookingPaymentStatus" NOT NULL DEFAULT 'CREATING',
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "policy_mode_snapshot" "DepositPolicyMode" NOT NULL,
  "policy_value_snapshot" INTEGER NOT NULL,
  "external_reference" TEXT NOT NULL,
  "provider_preference_id" TEXT,
  "provider_payment_id" TEXT,
  "checkout_url_ciphertext" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "approved_at" TIMESTAMP(3),
  "rejected_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "expired_at" TIMESTAMP(3),
  "review_required_at" TIMESTAMP(3),
  "review_reason_code" VARCHAR(120),
  "provider_status" VARCHAR(120),
  "provider_status_detail" VARCHAR(255),
  "last_error_code" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "booking_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booking_payments_amount_check" CHECK ("amount_cents" > 0),
  CONSTRAINT "booking_payments_currency_check" CHECK ("currency" = 'ARS'),
  CONSTRAINT "booking_payments_terminal_timestamp_check"
    CHECK (
      (status = 'APPROVED' AND approved_at IS NOT NULL)
      OR (status = 'REJECTED' AND rejected_at IS NOT NULL)
      OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL)
      OR (status = 'EXPIRED' AND expired_at IS NOT NULL)
      OR (status = 'REVIEW_REQUIRED' AND review_required_at IS NOT NULL)
      OR (status IN ('CREATING', 'PENDING', 'REFUNDED', 'ERROR'))
    )
);

CREATE UNIQUE INDEX "booking_payments_external_reference_key"
  ON "booking_payments"("external_reference");

CREATE UNIQUE INDEX "booking_payments_provider_payment_id_key"
  ON "booking_payments"("provider_payment_id");

CREATE INDEX "booking_payments_status_expires_at_idx"
  ON "booking_payments"("status", "expires_at");

CREATE INDEX "booking_payments_barbershop_id_created_at_idx"
  ON "booking_payments"("barbershop_id", "created_at");

CREATE INDEX "booking_payments_appointment_id_status_idx"
  ON "booking_payments"("appointment_id", "status");

ALTER TABLE "booking_payments"
  ADD CONSTRAINT "booking_payments_appointment_id_barbershop_id_fkey"
  FOREIGN KEY ("appointment_id", "barbershop_id") REFERENCES "appointments"("id", "barbershop_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booking_payments"
  ADD CONSTRAINT "booking_payments_barbershop_id_fkey"
  FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booking_payments"
  ADD CONSTRAINT "booking_payments_payment_connection_id_fkey"
  FOREIGN KEY ("payment_connection_id") REFERENCES "barbershop_payment_connections"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "payment_webhook_events" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT,
  "payment_connection_id" TEXT,
  "booking_payment_id" TEXT,
  "provider" "PaymentProvider" NOT NULL,
  "status" "PaymentWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "event_topic" VARCHAR(120),
  "event_action" VARCHAR(120),
  "data_id" TEXT NOT NULL,
  "external_reference" VARCHAR(120),
  "request_id" VARCHAR(120),
  "signature_ts" VARCHAR(120),
  "raw_body_sha256" VARCHAR(64) NOT NULL,
  "processed_at" TIMESTAMP(3),
  "last_error_code" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_webhook_event_provider_data_reference_key"
  ON "payment_webhook_events"("provider", "data_id", "external_reference");

CREATE INDEX "payment_webhook_events_status_created_at_idx"
  ON "payment_webhook_events"("status", "created_at");

ALTER TABLE "payment_webhook_events"
  ADD CONSTRAINT "payment_webhook_events_barbershop_id_fkey"
  FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_webhook_events"
  ADD CONSTRAINT "payment_webhook_events_payment_connection_id_fkey"
  FOREIGN KEY ("payment_connection_id") REFERENCES "barbershop_payment_connections"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_webhook_events"
  ADD CONSTRAINT "payment_webhook_events_booking_payment_id_fkey"
  FOREIGN KEY ("booking_payment_id") REFERENCES "booking_payments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "barbershop_deposit_policies" (
  "id",
  "barbershop_id",
  "mode",
  "hold_duration_minutes",
  "currency",
  "created_at",
  "updated_at"
)
SELECT
  CONCAT('dep_', SUBSTRING(md5(id) FROM 1 FOR 24)),
  id,
  'DISABLED'::"DepositPolicyMode",
  15,
  'ARS',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "barbershops";
