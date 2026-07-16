CREATE TYPE "PaymentReviewStatus" AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED'
);

CREATE TYPE "PaymentReviewReason" AS ENUM (
  'APPROVED_AFTER_HOLD_EXPIRY',
  'APPROVED_PAYMENT_ON_CANCELLED_APPOINTMENT',
  'AMOUNT_MISMATCH',
  'CURRENCY_MISMATCH',
  'SELLER_MISMATCH',
  'EXTERNAL_REFERENCE_MISMATCH',
  'PREFERENCE_MISMATCH',
  'DUPLICATE_PROVIDER_PAYMENT',
  'PROVIDER_RECONCILIATION_ERROR',
  'OTHER'
);

CREATE TYPE "PaymentReviewResolution" AS ENUM (
  'REFUNDED_EXTERNALLY',
  'NO_REFUND_REQUIRED',
  'CUSTOMER_CREDIT_GRANTED',
  'PAYMENT_ACCEPTED_MANUALLY',
  'DUPLICATE_RESOLVED',
  'OTHER'
);

CREATE TYPE "PaymentReviewActionType" AS ENUM (
  'OPENED',
  'MARKED_IN_PROGRESS',
  'NOTE_ADDED',
  'RESOLVED',
  'REOPENED'
);

ALTER TABLE "payment_webhook_events"
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "booking_payment_reviews" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "booking_payment_id" TEXT NOT NULL,
  "reason" "PaymentReviewReason" NOT NULL,
  "status" "PaymentReviewStatus" NOT NULL DEFAULT 'OPEN',
  "resolution" "PaymentReviewResolution",
  "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMP(3),
  "resolved_at" TIMESTAMP(3),
  "assigned_to_user_id" TEXT,
  "resolved_by_user_id" TEXT,
  "latest_note" VARCHAR(1000),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "booking_payment_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booking_payment_reviews_latest_note_check"
    CHECK ("latest_note" IS NULL OR length(trim("latest_note")) BETWEEN 1 AND 1000),
  CONSTRAINT "booking_payment_reviews_resolution_check"
    CHECK (
      ("status" = 'RESOLVED' AND "resolution" IS NOT NULL AND "resolved_at" IS NOT NULL)
      OR ("status" IN ('OPEN', 'IN_PROGRESS') AND "resolved_at" IS NULL)
    )
);

CREATE UNIQUE INDEX "booking_payment_reviews_booking_payment_id_reason_key"
  ON "booking_payment_reviews"("booking_payment_id", "reason");

CREATE INDEX "booking_payment_reviews_barbershop_id_status_opened_at_idx"
  ON "booking_payment_reviews"("barbershop_id", "status", "opened_at");

ALTER TABLE "booking_payment_reviews"
  ADD CONSTRAINT "booking_payment_reviews_barbershop_id_fkey"
  FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booking_payment_reviews"
  ADD CONSTRAINT "booking_payment_reviews_booking_payment_id_fkey"
  FOREIGN KEY ("booking_payment_id") REFERENCES "booking_payments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booking_payment_reviews"
  ADD CONSTRAINT "booking_payment_reviews_assigned_to_user_id_fkey"
  FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "booking_payment_reviews"
  ADD CONSTRAINT "booking_payment_reviews_resolved_by_user_id_fkey"
  FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "booking_payment_review_actions" (
  "id" TEXT NOT NULL,
  "barbershop_id" TEXT NOT NULL,
  "review_id" TEXT NOT NULL,
  "action" "PaymentReviewActionType" NOT NULL,
  "actor_user_id" TEXT,
  "actor_role" "UserRole",
  "note" VARCHAR(1000),
  "resolution" "PaymentReviewResolution",
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "booking_payment_review_actions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booking_payment_review_actions_note_check"
    CHECK ("note" IS NULL OR length(trim("note")) BETWEEN 1 AND 1000),
  CONSTRAINT "booking_payment_review_actions_resolution_check"
    CHECK (
      ("action" = 'RESOLVED' AND "resolution" IS NOT NULL)
      OR ("action" <> 'RESOLVED')
    )
);

CREATE INDEX "booking_payment_review_actions_review_id_created_at_idx"
  ON "booking_payment_review_actions"("review_id", "created_at");

CREATE INDEX "booking_payment_review_actions_barbershop_id_created_at_idx"
  ON "booking_payment_review_actions"("barbershop_id", "created_at");

ALTER TABLE "booking_payment_review_actions"
  ADD CONSTRAINT "booking_payment_review_actions_barbershop_id_fkey"
  FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booking_payment_review_actions"
  ADD CONSTRAINT "booking_payment_review_actions_review_id_fkey"
  FOREIGN KEY ("review_id") REFERENCES "booking_payment_reviews"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booking_payment_review_actions"
  ADD CONSTRAINT "booking_payment_review_actions_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

WITH safe_legacy_reviews AS (
  SELECT
    bp.id AS booking_payment_id,
    bp.barbershop_id,
    bp.review_required_at,
    CASE bp.review_reason_code
      WHEN 'PAYMENT_APPROVED_AFTER_HOLD_EXPIRY' THEN 'APPROVED_AFTER_HOLD_EXPIRY'::"PaymentReviewReason"
      WHEN 'APPROVED_PAYMENT_ON_CANCELLED_APPOINTMENT' THEN 'APPROVED_PAYMENT_ON_CANCELLED_APPOINTMENT'::"PaymentReviewReason"
      ELSE NULL
    END AS reason,
    CASE
      WHEN COALESCE(bp.provider_status, '') = 'approved' OR bp.approved_at IS NOT NULL THEN 'APPROVED'::"BookingPaymentStatus"
      ELSE NULL
    END AS inferred_status
  FROM "booking_payments" bp
  WHERE bp.status = 'REVIEW_REQUIRED'
)
INSERT INTO "booking_payment_reviews" (
  "id",
  "barbershop_id",
  "booking_payment_id",
  "reason",
  "status",
  "opened_at",
  "created_at",
  "updated_at"
)
SELECT
  'legacy_review_' || md5(booking_payment_id || ':' || reason::text),
  barbershop_id,
  booking_payment_id,
  reason,
  'OPEN'::"PaymentReviewStatus",
  COALESCE(review_required_at, CURRENT_TIMESTAMP),
  COALESCE(review_required_at, CURRENT_TIMESTAMP),
  CURRENT_TIMESTAMP
FROM safe_legacy_reviews
WHERE reason IS NOT NULL
  AND inferred_status IS NOT NULL
ON CONFLICT ("booking_payment_id", "reason") DO NOTHING;

WITH inserted_or_existing AS (
  SELECT
    bpr.id,
    bpr.barbershop_id,
    bpr.booking_payment_id,
    bpr.reason,
    bpr.opened_at
  FROM "booking_payment_reviews" bpr
  JOIN "booking_payments" bp ON bp.id = bpr.booking_payment_id
  WHERE bp.status = 'REVIEW_REQUIRED'
    AND bp.review_reason_code IN (
      'PAYMENT_APPROVED_AFTER_HOLD_EXPIRY',
      'APPROVED_PAYMENT_ON_CANCELLED_APPOINTMENT'
    )
)
INSERT INTO "booking_payment_review_actions" (
  "id",
  "barbershop_id",
  "review_id",
  "action",
  "created_at"
)
SELECT
  'legacy_review_action_' || md5(booking_payment_id || ':' || reason::text),
  barbershop_id,
  id,
  'OPENED'::"PaymentReviewActionType",
  opened_at
FROM inserted_or_existing
ON CONFLICT ("id") DO NOTHING;

UPDATE "booking_payments" bp
SET
  "status" = 'APPROVED',
  "approved_at" = COALESCE(bp."approved_at", bp."review_required_at", CURRENT_TIMESTAMP),
  "updated_at" = CURRENT_TIMESTAMP
WHERE bp."status" = 'REVIEW_REQUIRED'
  AND bp."review_reason_code" IN (
    'PAYMENT_APPROVED_AFTER_HOLD_EXPIRY',
    'APPROVED_PAYMENT_ON_CANCELLED_APPOINTMENT'
  )
  AND (COALESCE(bp."provider_status", '') = 'approved' OR bp."approved_at" IS NOT NULL);
