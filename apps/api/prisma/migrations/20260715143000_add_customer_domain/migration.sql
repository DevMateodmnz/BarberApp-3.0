-- Phase 2: first-class customer directory and visit history.
--
-- This migration:
--   1. creates `customers`;
--   2. adds nullable `appointments.customer_id`;
--   3. enforces same-tenant appointment/customer links with a composite FK;
--   4. backfills one customer per (barbershop_id, client_phone_normalized);
--   5. links matching non-deleted appointments without rewriting snapshots.

CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "barbershop_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_normalized" TEXT NOT NULL,
    "email" TEXT,
    "internal_notes" VARCHAR(2000),
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "appointments"
    ADD COLUMN "customer_id" TEXT;

ALTER TABLE "customers"
    ADD CONSTRAINT "customers_barbershop_id_fkey"
    FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "customers_id_barbershop_id_key"
    ON "customers"("id", "barbershop_id");

CREATE UNIQUE INDEX "customers_barbershop_id_phone_normalized_key"
    ON "customers"("barbershop_id", "phone_normalized");

CREATE INDEX "customers_barbershop_id_name_idx"
    ON "customers"("barbershop_id", "name");

CREATE INDEX "customers_barbershop_id_last_seen_at_idx"
    ON "customers"("barbershop_id", "last_seen_at");

CREATE INDEX "appointments_customer_id_idx"
    ON "appointments"("customer_id");

CREATE INDEX "appointments_customer_id_barbershop_id_idx"
    ON "appointments"("customer_id", "barbershop_id");

ALTER TABLE "appointments"
    ADD CONSTRAINT "appointments_customer_id_barbershop_id_fkey"
    FOREIGN KEY ("customer_id", "barbershop_id")
    REFERENCES "customers"("id", "barbershop_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

WITH eligible AS (
    SELECT
        id,
        barbershop_id,
        client_name,
        client_phone,
        client_phone_normalized,
        start_at
    FROM appointments
    WHERE deleted_at IS NULL
      AND client_phone_normalized IS NOT NULL
      AND client_phone_normalized ~ '^\+[1-9][0-9]{7,19}$'
),
grouped AS (
    SELECT
        barbershop_id,
        client_phone_normalized,
        MIN(start_at) AS first_seen_at,
        MAX(start_at) AS last_seen_at
    FROM eligible
    GROUP BY barbershop_id, client_phone_normalized
),
inserted_customers AS (
    INSERT INTO customers (
        id,
        barbershop_id,
        name,
        phone,
        phone_normalized,
        email,
        internal_notes,
        first_seen_at,
        last_seen_at,
        created_at,
        updated_at,
        deleted_at
    )
    SELECT
        'cust_' || substr(md5(
            g.barbershop_id
            || ':' || g.client_phone_normalized
            || ':' || clock_timestamp()::text
            || ':' || random()::text
        ), 1, 28) AS id,
        g.barbershop_id,
        COALESCE(
            (
                SELECT NULLIF(btrim(e.client_name), '')
                FROM eligible e
                WHERE e.barbershop_id = g.barbershop_id
                  AND e.client_phone_normalized = g.client_phone_normalized
                ORDER BY e.start_at DESC, e.id DESC
                LIMIT 1
            ),
            g.client_phone_normalized
        ) AS name,
        COALESCE(
            (
                SELECT NULLIF(btrim(e.client_phone), '')
                FROM eligible e
                WHERE e.barbershop_id = g.barbershop_id
                  AND e.client_phone_normalized = g.client_phone_normalized
                ORDER BY e.start_at DESC, e.id DESC
                LIMIT 1
            ),
            g.client_phone_normalized
        ) AS phone,
        g.client_phone_normalized,
        NULL::TEXT AS email,
        NULL::TEXT AS internal_notes,
        g.first_seen_at,
        g.last_seen_at,
        NOW(),
        NOW(),
        NULL::TIMESTAMP
    FROM grouped g
    RETURNING id, barbershop_id, phone_normalized
)
UPDATE appointments a
SET customer_id = c.id
FROM customers c
WHERE a.deleted_at IS NULL
  AND a.customer_id IS NULL
  AND a.barbershop_id = c.barbershop_id
  AND a.client_phone_normalized = c.phone_normalized
  AND a.client_phone_normalized ~ '^\+[1-9][0-9]{7,19}$';
