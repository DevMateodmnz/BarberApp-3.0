import type { PrismaClient } from '@prisma/client';

export async function reRunBackfill(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
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
        AND client_phone_normalized ~ '^\\+[1-9][0-9]{7,19}$'
    ),
    grouped AS (
      SELECT
        barbershop_id,
        client_phone_normalized,
        MIN(start_at) AS first_seen_at,
        MAX(start_at) AS last_seen_at
      FROM eligible
      GROUP BY barbershop_id, client_phone_normalized
    )
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
      ), 1, 28),
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
      ),
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
      ),
      g.client_phone_normalized,
      NULL,
      NULL,
      g.first_seen_at,
      g.last_seen_at,
      NOW(),
      NOW(),
      NULL
    FROM grouped g
    ON CONFLICT (barbershop_id, phone_normalized) DO NOTHING
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE appointments a
    SET customer_id = c.id
    FROM customers c
    WHERE a.deleted_at IS NULL
      AND a.customer_id IS NULL
      AND a.barbershop_id = c.barbershop_id
      AND a.client_phone_normalized = c.phone_normalized
      AND a.client_phone_normalized ~ '^\\+[1-9][0-9]{7,19}$'
  `);
}
